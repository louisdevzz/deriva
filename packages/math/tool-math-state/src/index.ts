/**
 * Model-facing derivation-state tools: view, set (PLAN phase), and commit
 * (COMMIT phase) against `<workspaceDir>/.derive/math-state.json`.
 * @module @deriva/tool-math-state
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { applyMathStateTools } from './tools.ts'

export type { DerivedStep, MathState } from './state.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-math-state'

/** Services required before the derivation-state tool suite can register. */
export const inject = ['tools']

export interface Config {
  /** Root directory whose `.derive/math-state.json` this suite reads and writes. Defaults to `process.cwd()`. */
  workspaceDir?: string
}

export const Config: z<Config> = z.object({
  workspaceDir: z.string().default(process.cwd()),
})

/** Register the derivation-state tool suite. */
export function apply(ctx: Context, config: Config): void {
  applyMathStateTools(ctx, config.workspaceDir ?? process.cwd())
}
