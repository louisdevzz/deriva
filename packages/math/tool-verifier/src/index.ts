/**
 * Model-facing deterministic verification tools (symbolic equivalence, ODE
 * residual, numeric spot-check) backed by SymPy via `ctx.mathPython`.
 * @module @deriva/tool-verifier
 */

import type { Context } from '@deepseek-ai/cordis'
import { applyVerifierTools } from './tools.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-verifier'

/** Services required before the verification tool suite can register. */
export const inject = ['tools', 'mathPython']

/** Register the full verification tool suite. */
export function apply(ctx: Context): void {
  applyVerifierTools(ctx)
}
