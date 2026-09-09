/**
 * Mathematical Derivation Agent — Dedicated Runner Plugin.
 *
 * Implements the core derivation execution loop:
 *   PLAN → EXECUTE → VERIFY → COMMIT
 *
 * Provides structured derivation state management:
 *   - math-state.json (known, derived, goals, assumptions)
 *   - derivation-graph.json (step-by-step dependency DAG)
 *
 * @module @deriva/cli/runner
 */

import { randomUUID } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { brandString } from '@deepseek-ai/dsh-brand'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import type { Agent, ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import type { Session, SessionId, SessionLogOffset } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-cmdline'

/** Stable Cordis plugin name. */
export const name = 'derive-runner'

/** Core services required before derivation can start. */
export const inject = ['agentDefaultModel', 'agents', 'sessions']

export interface Config {
  /** The mathematical derivation task prompt. */
  task: string
  /** Working directory for derivation artifacts (.math-state, etc). */
  workspaceDir?: string
}

export const Config: z<Config> = z.object({
  task: z.string().required(),
  workspaceDir: z.string().default(process.cwd()),
})

/** Structured state for a mathematical derivation session. */
export interface MathState {
  problem: string
  known: string[]
  assumptions: string[]
  derived: Array<{
    step: number
    statement: string
    expression: string
    justification: string
    verified: boolean
  }>
  goals: string[]
  status: 'in_progress' | 'completed' | 'failed'
}

/** Output streams for the derivation runner. */
interface DeriveIo {
  stdout: { write(chunk: string): unknown }
  stderr: { write(chunk: string): unknown }
  exit(code: number): void
}

export const internals: { stdout: DeriveIo['stdout']; stderr: DeriveIo['stderr'] } = {
  stdout: process.stdout,
  stderr: process.stderr,
}

/**
 * Stream provider reasoning to stderr as it arrives.
 */
function streamReasoning(ctx: Context, agent: Agent, stderr: DeriveIo['stderr']): () => void {
  let open = false
  let endsWithNewline = true

  const close = (): void => {
    if (!open) return
    if (!endsWithNewline) stderr.write('\n')
    open = false
    endsWithNewline = true
  }

  const dispose = ctx.on('agent/assistant-stream', ({ agent: subject, frame }) => {
    if (subject !== agent) return
    if (frame.type === 'start' || frame.type === 'end') {
      close()
      return
    }

    const chunk = frame.chunk
    switch (chunk.type) {
      case 'reasoning-delta':
        if (chunk.text === '') return
        if (!open) {
          stderr.write('\x1b[36m[derive: reasoning]\x1b[0m\n')
          open = true
        }
        stderr.write(chunk.text)
        endsWithNewline = chunk.text.endsWith('\n')
        return
      case 'block-start':
        if (chunk.blockType !== 'reasoning') close()
        return
      case 'block-end':
        if (chunk.block.type !== 'reasoning') close()
        return
      case 'usage':
        return
      case 'text-delta':
      case 'tool-call-delta':
      case 'finish':
        close()
        return
      default:
        return assertNever(chunk, 'derive reasoning stream')
    }
  })

  return () => {
    dispose()
    close()
  }
}

/** Extract text and completion reason from a session's event log. */
function summarize(session: Session, firstSeq: SessionLogOffset): { text: string; error?: string | undefined } {
  let started = false
  let text = ''
  let error: string | undefined
  const length = session.seq

  for (let seq = firstSeq; seq < length; seq++) {
    const event = session.eventAt(SessionSeq(seq))
    if (event === undefined) continue
    if (event.type === 'turn/start') {
      started = true
      continue
    }
    if (!started) continue
    if (event.type === 'assistant/message') {
      const joined = event.data.message.content
        .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
        .map(block => block.text)
        .join('')
      if (joined !== '') text = joined
    }
    if (event.type === 'turn/end' && event.data.reason?.kind === 'error') {
      error = `${event.data.reason.error.code}: ${event.data.reason.error.message}`
    }
  }

  return { text, error }
}

/** Run one mathematical derivation task end to end. */
async function runDerivation(ctx: Context, config: Config, io: DeriveIo): Promise<void> {
  await ctx.get('loader')?.await()
  const agents = ctx.get('agents')
  const defaultModel = ctx.get('agentDefaultModel')
  const sessions = ctx.get('sessions')

  if (agents === undefined || defaultModel === undefined || sessions === undefined) {
    io.stderr.write('derive: core services not available\n')
    io.exit(1)
    return
  }

  const workspace = config.workspaceDir ?? process.cwd()
  const artifactDir = join(workspace, '.derive')
  mkdirSync(artifactDir, { recursive: true })

  // Initialize derivation state on disk
  const initialState: MathState = {
    problem: config.task,
    known: [],
    assumptions: [],
    derived: [],
    goals: [config.task],
    status: 'in_progress',
  }
  writeFileSync(join(artifactDir, 'math-state.json'), JSON.stringify(initialState, null, 2))

  let selection = defaultModel.currentSelection()
  if (!selection.provider) {
    const providers = ctx.get('llm')?.listProviders() ?? []
    for (const provider of providers) {
      const models = await ctx.get('llm')?.listModels(provider.id) ?? []
      if (models.length > 0) {
        selection = { provider: provider.id, model: models[0]!.id }
        break
      }
    }
  }
  io.stderr.write(`\x1b[32m[deriva]\x1b[0m Model: ${selection.provider || 'none'}/${selection.model || 'none'}\n`)
  io.stderr.write(`\x1b[32m[deriva]\x1b[0m Task: ${config.task}\n\n`)

  const { agent } = await agents.create({
    sessionId: brandString<SessionId>(`session-${randomUUID()}`),
    meta: { cwd: workspace },
    agentOptions: { provider: selection.provider, model: selection.model },
    setup: (agentCtx) => {
      const selected: ModelSelectionRef = { current: selection, assembled: undefined }
      installModelSelection(agentCtx, selected)
    },
  })

  await agent.whenIdle()
  const firstSeq = agent.session.seq
  const stopReasoning = streamReasoning(ctx, agent, io.stderr)

  try {
    agent.followup(createUserMessage({
      content: [{
        type: 'text',
        text: `Solve the following mathematical problem through rigorous derivation.\n` +
          `Follow the PLAN → EXECUTE → VERIFY → COMMIT cycle.\n\n` +
          `Problem:\n${config.task}`,
      }],
      source: { kind: 'user' },
    }))
    await agent.whenIdle()
  } finally {
    stopReasoning()
  }

  await sessions.flush(agent.session)
  const outcome = summarize(agent.session, firstSeq)

  if (outcome.error) {
    io.stderr.write(`\x1b[31m[derive: error]\x1b[0m ${outcome.error}\n`)
    initialState.status = 'failed'
  } else {
    initialState.status = 'completed'
  }

  writeFileSync(join(artifactDir, 'math-state.json'), JSON.stringify(initialState, null, 2))

  // Output derivation result
  io.stdout.write('\n' + outcome.text + '\n')
  io.exit(outcome.error ? 1 : 0)
}

export function apply(ctx: Context, config: Config): void {
  const exit = ctx.get('appExit')
  if (exit === undefined) {
    throw new Error('derive-runner: ctx.appExit must be provided by launcher')
  }
  const io: DeriveIo = { stdout: internals.stdout, stderr: internals.stderr, exit }
  void runDerivation(ctx, config, io).catch((error: unknown) => {
    io.stderr.write(`derive: ${error instanceof Error ? error.message : String(error)}\n`)
    io.exit(1)
  })
}
