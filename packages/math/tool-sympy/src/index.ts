/**
 * Model-facing symbolic computation tools (factor, expand, simplify, solve,
 * integrate, differentiate, solve_ode) backed by SymPy via `ctx.mathPython`.
 * @module @deriva/tool-sympy
 */

import type { Context } from '@deepseek-ai/cordis'
import { applySympyTools } from './tools.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-sympy'

/** Services required before the symbolic tool suite can register. */
export const inject = ['tools', 'mathPython']

/** Register the full symbolic-computation tool suite. */
export function apply(ctx: Context): void {
  applySympyTools(ctx)
}
