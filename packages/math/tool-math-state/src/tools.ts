/**
 * Tool definitions for the derivation state: view the current struct, set the
 * plan-time sections (known facts, goals, assumptions), and commit one
 * verified derived step. Maps directly to the project's PLAN (set) and
 * COMMIT (commit) phases.
 * @module @deriva/tool-math-state/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { loadMathState, saveMathState } from './state.ts'
import type { MathState } from './state.ts'

const MATH_STATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    problem: { type: 'string', required: true },
    known: { type: 'array', required: true, items: { type: 'string' } },
    assumptions: { type: 'array', required: true, items: { type: 'string' } },
    goals: { type: 'array', required: true, items: { type: 'string' } },
    status: { type: 'string', required: true, enum: ['in_progress', 'completed', 'failed'] },
    derived: {
      type: 'array',
      required: true,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          step: { type: 'integer', required: true },
          statement: { type: 'string', required: true },
          expression: { type: 'string', required: true },
          justification: { type: 'string', required: true },
          verified: { type: 'boolean', required: true },
        },
      },
    },
  },
} as const

function formatState(state: MathState): string {
  const lines = [
    `Problem: ${state.problem || '(not set)'}`,
    `Status: ${state.status}`,
    `Known (${String(state.known.length)}): ${state.known.join('; ') || '(none)'}`,
    `Assumptions (${String(state.assumptions.length)}): ${state.assumptions.join('; ') || '(none)'}`,
    `Goals (${String(state.goals.length)}): ${state.goals.join('; ') || '(none)'}`,
    `Derived steps (${String(state.derived.length)}):`,
  ]
  for (const entry of state.derived) {
    lines.push(`  ${String(entry.step)}. [${entry.verified ? 'verified' : 'UNVERIFIED'}] ${entry.statement}: ${entry.expression} (${entry.justification})`)
  }
  return lines.join('\n')
}

function defineViewTool(workspaceDir: string): ToolDefinition {
  return defineTool({
    name: 'math_state_view',
    description: 'View the current mathematical derivation state: problem, known facts, assumptions, goals, and verified derived steps.',
    parameters: {},
    output: {
      schema: MATH_STATE_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: formatState(value) }],
    },
    isConcurrencySafe: () => true,
    async execute() {
      return loadMathState(workspaceDir)
    },
  })
}

function defineSetTool(workspaceDir: string): ToolDefinition {
  return defineTool({
    name: 'math_state_set',
    description: 'Set the PLAN-phase sections of the derivation state. Each provided field replaces its section; omitted fields are left unchanged.',
    parameters: {
      problem: { type: 'string', description: 'The problem statement being derived.' },
      known: { type: 'array', items: { type: 'string' }, description: 'Established facts and given quantities. Replaces the current list.' },
      assumptions: { type: 'array', items: { type: 'string' }, description: 'Stated assumptions and their valid domains. Replaces the current list.' },
      goals: { type: 'array', items: { type: 'string' }, description: 'What remains to be shown or found. Replaces the current list.' },
    },
    output: {
      schema: MATH_STATE_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: formatState(value) }],
    },
    isConcurrencySafe: () => false,
    async execute(args) {
      const state = await loadMathState(workspaceDir)
      if (args.problem !== undefined) state.problem = args.problem
      if (args.known !== undefined) state.known = args.known
      if (args.assumptions !== undefined) state.assumptions = args.assumptions
      if (args.goals !== undefined) state.goals = args.goals
      await saveMathState(workspaceDir, state)
      return state
    },
  })
}

function defineCommitTool(workspaceDir: string): ToolDefinition {
  return defineTool({
    name: 'math_state_commit',
    description: 'Commit one derivation step after it has passed verification (or record it as explicitly unverified). Only call this after a verify_* tool has checked the result — never commit an unchecked claim as verified.',
    parameters: {
      statement: { type: 'string', required: true, description: 'What this step establishes, in plain language.' },
      expression: { type: 'string', required: true, description: 'The mathematical expression or equation this step produced.' },
      justification: { type: 'string', required: true, description: 'How this step was obtained or verified, e.g. "verify_equivalence: difference simplifies to 0".' },
      verified: { type: 'boolean', required: true, description: 'Whether a verify_* tool confirmed this step. Never set true without having called one.' },
    },
    output: {
      schema: MATH_STATE_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: formatState(value) }],
    },
    isConcurrencySafe: () => false,
    async execute(args) {
      const state = await loadMathState(workspaceDir)
      state.derived.push({
        step: state.derived.length + 1,
        statement: args.statement,
        expression: args.expression,
        justification: args.justification,
        verified: args.verified,
      })
      await saveMathState(workspaceDir, state)
      return state
    },
  })
}

/** Register the derivation-state tool suite, rooted at `workspaceDir`'s `.derive/math-state.json`. */
export function applyMathStateTools(ctx: Context, workspaceDir: string): void {
  ctx.tools.register(defineViewTool(workspaceDir))
  ctx.tools.register(defineSetTool(workspaceDir))
  ctx.tools.register(defineCommitTool(workspaceDir))
}
