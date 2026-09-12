/**
 * Tool definitions for deterministic verification: symbolic equivalence,
 * ODE residual checking, and numeric spot-checking at random sample points.
 * These are the gate a derivation step must pass before COMMIT, per the
 * project's PLAN → EXECUTE → VERIFY → COMMIT loop.
 * @module @deriva/tool-verifier/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { runSympyScript } from './harness.ts'

function pyLiteral(value: string | number): string {
  return JSON.stringify(value)
}

interface EquivalenceResult extends Record<string, unknown> {
  equivalent: boolean
  difference: string
}

interface OdeResidualResult extends Record<string, unknown> {
  satisfies: boolean
  residual: string
}

interface NumericSpotResult extends Record<string, unknown> {
  equivalent: boolean
  samples: number
  maxAbsoluteDifference: number
  variables: string[]
}

function equivalenceText(outcome: { ok: boolean; equivalent?: unknown; difference?: unknown; error?: unknown }): string {
  if (!outcome.ok) return `Verification failed to run: ${String(outcome.error)}`
  return outcome.equivalent
    ? 'Equivalent: the difference simplifies to 0.'
    : `Not equivalent: the difference simplifies to ${String(outcome.difference)}.`
}

/** `verify_equivalence`: symbolic check that `lhs - rhs` simplifies to exactly 0. */
function defineEquivalenceTool(ctx: Context): ToolDefinition {
  return defineTool({
    name: 'verify_equivalence',
    description: 'Symbolically verify that two expressions are equivalent by simplifying their difference to zero. Use this before committing an algebraic identity, factorization, or simplification.',
    parameters: {
      lhs: { type: 'string', required: true, description: 'First expression, e.g. the original form.' },
      rhs: { type: 'string', required: true, description: 'Second expression, e.g. the proposed simplified or factored form.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          equivalent: { type: 'boolean' },
          difference: { type: 'string' },
          error: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: equivalenceText(value) }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const body = `lhs = sp.sympify(${pyLiteral(args.lhs)})
rhs = sp.sympify(${pyLiteral(args.rhs)})
difference = sp.simplify(lhs - rhs)
return {"equivalent": difference == 0, "difference": str(difference)}`
      return runSympyScript<EquivalenceResult>(ctx, body, exec.signal)
    },
  })
}

/** `verify_ode_residual`: checks a candidate solution against an ODE via SymPy's `checkodesol`. */
function defineOdeResidualTool(ctx: Context): ToolDefinition {
  return defineTool({
    name: 'verify_ode_residual',
    description: 'Verify a candidate solution against an ordinary differential equation using SymPy checkodesol. Write the unknown function as e.g. "y(t)" and derivatives as "Derivative(y(t), t)".',
    parameters: {
      equation: { type: 'string', required: true, description: 'ODE, e.g. "Derivative(y(t), t, 2) + y(t)" (implicitly "= 0") or "Derivative(y(t), t, 2) + y(t) = 0".' },
      solution: { type: 'string', required: true, description: 'Candidate right-hand side for y(t), e.g. "C1*sin(t) + C2*cos(t)".' },
      function_name: { type: 'string', description: 'Unknown function name. Defaults to "y".' },
      variable_name: { type: 'string', description: 'Independent variable name. Defaults to "t".' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          satisfies: { type: 'boolean' },
          residual: { type: 'string' },
          error: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: !value.ok
          ? `Verification failed to run: ${String(value.error)}`
          : value.satisfies
            ? 'Solution satisfies the ODE: residual is 0.'
            : `Solution does NOT satisfy the ODE: residual is ${String(value.residual)}.`,
      }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const functionName = args.function_name ?? 'y'
      const variableName = args.variable_name ?? 't'
      const body = `t = sp.Symbol(${pyLiteral(variableName)})
y = sp.Function(${pyLiteral(functionName)})
equation_text = ${pyLiteral(args.equation)}
scope = {${pyLiteral(functionName)}: y, ${pyLiteral(variableName)}: t}
if "=" in equation_text:
    lhs_text, rhs_text = equation_text.split("=", 1)
    ode = sp.Eq(sp.sympify(lhs_text, locals=scope), sp.sympify(rhs_text, locals=scope))
else:
    ode = sp.sympify(equation_text, locals=scope)
candidate = sp.Eq(y(t), sp.sympify(${pyLiteral(args.solution)}, locals=scope))
satisfies, residual = sp.checkodesol(ode, candidate)
return {"satisfies": bool(satisfies), "residual": str(residual)}`
      return runSympyScript<OdeResidualResult>(ctx, body, exec.signal)
    },
  })
}

/** `verify_numeric_spot`: substitutes random numeric values for every free symbol and compares. */
function defineNumericSpotTool(ctx: Context): ToolDefinition {
  return defineTool({
    name: 'verify_numeric_spot',
    description: 'Numerically spot-check that two expressions agree by substituting random values for every free variable across many samples. Use this alongside verify_equivalence as an independent cross-check, or when a symbolic simplification is too slow.',
    parameters: {
      lhs: { type: 'string', required: true, description: 'First expression.' },
      rhs: { type: 'string', required: true, description: 'Second expression.' },
      samples: { type: 'number', description: 'Number of random sample points. Defaults to 50.' },
      tolerance: { type: 'number', description: 'Maximum allowed absolute difference. Defaults to 1e-6.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          equivalent: { type: 'boolean' },
          samples: { type: 'integer' },
          maxAbsoluteDifference: { type: 'number' },
          variables: { type: 'array', items: { type: 'string' } },
          error: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: !value.ok
          ? `Verification failed to run: ${String(value.error)}`
          : `${value.equivalent ? 'Equivalent' : 'NOT equivalent'} across ${String(value.samples)} random samples over [${(value.variables as string[] | undefined)?.join(', ') ?? ''}] (max |Δ| = ${String(value.maxAbsoluteDifference)}).`,
      }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const samples = args.samples ?? 50
      const tolerance = args.tolerance ?? 1e-6
      const body = `import random
lhs = sp.sympify(${pyLiteral(args.lhs)})
rhs = sp.sympify(${pyLiteral(args.rhs)})
symbols = sorted(lhs.free_symbols | rhs.free_symbols, key=str)
random.seed(1)
max_diff = 0.0
for _ in range(${pyLiteral(samples)}):
    point = {symbol: random.uniform(-10, 10) for symbol in symbols}
    diff = abs(complex(lhs.subs(point)) - complex(rhs.subs(point)))
    max_diff = max(max_diff, diff)
return {
    "equivalent": max_diff < ${pyLiteral(tolerance)},
    "samples": ${pyLiteral(samples)},
    "maxAbsoluteDifference": max_diff,
    "variables": [str(symbol) for symbol in symbols],
}`
      return runSympyScript<NumericSpotResult>(ctx, body, exec.signal)
    },
  })
}

/** Register the full verification tool suite. */
export function applyVerifierTools(ctx: Context): void {
  ctx.tools.register(defineEquivalenceTool(ctx))
  ctx.tools.register(defineOdeResidualTool(ctx))
  ctx.tools.register(defineNumericSpotTool(ctx))
}
