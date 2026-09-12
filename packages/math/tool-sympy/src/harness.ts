/**
 * Shared SymPy script harness: wraps one Python body in a `main()` function and a
 * try/except that always emits well-formed JSON on stdout, so a SymPy-side failure
 * (bad syntax, unsolvable equation, domain error) surfaces as `{ok: false, error}`
 * tool output instead of an unhandled Python traceback or a thrown TypeScript error.
 * @module @deriva/tool-sympy/harness
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deriva/math-python'

/** One parsed script outcome: the declared success fields, or a domain-level error message. */
export type ScriptOutcome<T extends Record<string, unknown>> =
  | ({ readonly ok: true } & T)
  | { readonly ok: false; readonly error: string }

/**
 * Run one Python body against `ctx.mathPython`.
 * @param ctx - plugin context providing the mounted `mathPython` service.
 * @param body - Python source for `main()`; must `return {...}` a JSON-serializable
 *   dict of success fields (or raise, which the harness converts to `{ok: false, error}`).
 * @param signal - aborts the underlying interpreter process.
 * @returns the parsed `{ok: true, ...}` or `{ok: false, error}` outcome.
 * @throws when the interpreter itself fails (non-zero exit with no JSON output) —
 *   an infrastructure failure distinct from a domain-level math error.
 */
export async function runSympyScript<T extends Record<string, unknown>>(
  ctx: Context,
  body: string,
  signal: AbortSignal | undefined,
): Promise<ScriptOutcome<T>> {
  const script = `import json
import sympy as sp


def main():
${indent(body)}


try:
    print(json.dumps({"ok": True, **main()}))
except Exception as error:
    print(json.dumps({"ok": False, "error": f"{type(error).__name__}: {error}"}))
`
  const { stdout, stderr, exitCode } = await ctx.mathPython.run(script, signal)
  const lastLine = stdout.trim().split('\n').at(-1)
  if (exitCode !== 0 || lastLine === undefined || lastLine === '') {
    throw new Error(`math-python: interpreter failed (exit ${String(exitCode)}): ${stderr.trim() || stdout.trim() || '(no output)'}`)
  }
  try {
    return JSON.parse(lastLine) as ScriptOutcome<T>
  } catch {
    throw new Error(`math-python: could not parse script output as JSON: ${lastLine}`)
  }
}

function indent(body: string): string {
  return body
    .split('\n')
    .map((line) => (line.length === 0 ? '' : `    ${line}`))
    .join('\n')
}
