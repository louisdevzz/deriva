/**
 * File-backed derivation state at `<cwd>/.derive/math-state.json`. Shape matches
 * `apps/derive/src/runner.ts`'s `MathState` so headless CLI runs and Web UI
 * sessions read and write the same structure interchangeably.
 * @module @deriva/tool-math-state/state
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** One verified (or rejected) derivation step, in commit order. */
export interface DerivedStep {
  readonly step: number
  readonly statement: string
  readonly expression: string
  readonly justification: string
  readonly verified: boolean
}

/** Structured state for a mathematical derivation session. */
export interface MathState {
  problem: string
  known: string[]
  assumptions: string[]
  derived: DerivedStep[]
  goals: string[]
  status: 'in_progress' | 'completed' | 'failed'
}

function emptyState(): MathState {
  return { problem: '', known: [], assumptions: [], derived: [], goals: [], status: 'in_progress' }
}

function statePath(workspaceDir: string): string {
  return join(workspaceDir, '.derive', 'math-state.json')
}

/** Read the current state, initializing an empty one on disk if none exists yet. */
export async function loadMathState(workspaceDir: string): Promise<MathState> {
  try {
    const raw = await readFile(statePath(workspaceDir), 'utf8')
    return JSON.parse(raw) as MathState
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    const initial = emptyState()
    await saveMathState(workspaceDir, initial)
    return initial
  }
}

/** Persist `state` verbatim, creating `.derive/` if needed. */
export async function saveMathState(workspaceDir: string, state: MathState): Promise<void> {
  const dir = join(workspaceDir, '.derive')
  await mkdir(dir, { recursive: true })
  await writeFile(statePath(workspaceDir), JSON.stringify(state, null, 2), 'utf8')
}
