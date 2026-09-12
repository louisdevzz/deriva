/**
 * Tool definitions for symbolic computation: factor, expand, simplify, solve,
 * integrate, differentiate, and solve_ode. Each builds one Python body for
 * {@link runSympyScript} with arguments interpolated as JSON literals (valid
 * Python syntax for strings and numbers) and returns the resulting expression
 * as both plain text and LaTeX.
 * @module @deriva/tool-sympy/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { runSympyScript } from './harness.ts'

/** Shape shared by every algebra/calculus result: the computed expression as text and LaTeX. */
interface ExpressionResult extends Record<string, unknown> {
  result: string
  latex: string
}

/** JSON-encode one value as a Python literal (valid for strings, numbers, and booleans alike). */
function pyLiteral(value: string | number): string {
  return JSON.stringify(value)
}

function toolResultText(outcome: { ok: boolean; result?: unknown; error?: unknown }): string {
  if (!outcome.ok) return `Computation failed: ${String(outcome.error)}`
  return String(outcome.result)
}

const EXPRESSION_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', required: true },
    result: { type: 'string' },
    latex: { type: 'string' },
    error: { type: 'string' },
  },
} as const

/** `factor`, `expand`, and `simplify` share one shape: one expression in, one expression out. */
function defineExpressionTool(ctx: Context, name: string, sympyOp: string, verb: string): ToolDefinition {
  return defineTool({
    name: `sympy_${name}`,
    description: `${verb} a mathematical expression using SymPy. Free variables are inferred automatically from the expression text.`,
    parameters: {
      expression: { type: 'string', required: true, description: 'Expression in Python/SymPy syntax, e.g. "x**4 - y**4 + x**2*z**2 - y**2*z**2".' },
    },
    output: {
      schema: EXPRESSION_RESULT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: toolResultText(value) }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const body = `expr = sp.sympify(${pyLiteral(args.expression)})
value = sp.${sympyOp}(expr)
return {"result": str(value), "latex": sp.latex(value)}`
      return runSympyScript<ExpressionResult>(ctx, body, exec.signal)
    },
  })
}

/** `solve`: parses `equation` (an `=`-separated equality, or a bare expression meaning `expr = 0`) for `variable`. */
function defineSolveTool(ctx: Context): ToolDefinition {
  return defineTool({
    name: 'sympy_solve',
    description: 'Solve an algebraic equation for one variable using SymPy. Accepts "lhs = rhs" or a bare expression (implicitly "expr = 0").',
    parameters: {
      equation: { type: 'string', required: true, description: 'Equation, e.g. "x**2 - 4 = 0" or "x**2 - 4".' },
      variable: { type: 'string', required: true, description: 'Variable to solve for, e.g. "x".' },
    },
    output: {
      schema: EXPRESSION_RESULT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: toolResultText(value) }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const body = `equation = ${pyLiteral(args.equation)}
if "=" in equation:
    lhs_text, rhs_text = equation.split("=", 1)
    lhs, rhs = sp.sympify(lhs_text), sp.sympify(rhs_text)
else:
    lhs, rhs = sp.sympify(equation), sp.Integer(0)
variable = sp.Symbol(${pyLiteral(args.variable)})
solutions = sp.solve(sp.Eq(lhs, rhs), variable)
return {"result": str(solutions), "latex": sp.latex(solutions)}`
      return runSympyScript<ExpressionResult>(ctx, body, exec.signal)
    },
  })
}

/** `integrate`: definite when both `lower`/`upper` bounds are given, indefinite otherwise. */
function defineIntegrateTool(ctx: Context): ToolDefinition {
  return defineTool({
    name: 'sympy_integrate',
    description: 'Integrate an expression with respect to one variable using SymPy. Supply both lower and upper for a definite integral.',
    parameters: {
      expression: { type: 'string', required: true, description: 'Integrand, e.g. "x/(exp(x) - 1)".' },
      variable: { type: 'string', required: true, description: 'Variable of integration, e.g. "x".' },
      lower: { type: 'string', description: 'Lower bound (definite integral only), e.g. "0".' },
      upper: { type: 'string', description: 'Upper bound (definite integral only), e.g. "oo".' },
    },
    output: {
      schema: EXPRESSION_RESULT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: toolResultText(value) }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const bounds = args.lower !== undefined && args.upper !== undefined
        ? `(variable, sp.sympify(${pyLiteral(args.lower)}), sp.sympify(${pyLiteral(args.upper)}))`
        : undefined
      const body = `expr = sp.sympify(${pyLiteral(args.expression)})
variable = sp.Symbol(${pyLiteral(args.variable)})
value = sp.integrate(expr, ${bounds ?? 'variable'})
return {"result": str(value), "latex": sp.latex(value)}`
      return runSympyScript<ExpressionResult>(ctx, body, exec.signal)
    },
  })
}

/** `differentiate`: `order`-th derivative with respect to `variable` (default 1). */
function defineDifferentiateTool(ctx: Context): ToolDefinition {
  return defineTool({
    name: 'sympy_differentiate',
    description: 'Differentiate an expression with respect to one variable using SymPy.',
    parameters: {
      expression: { type: 'string', required: true, description: 'Expression to differentiate.' },
      variable: { type: 'string', required: true, description: 'Variable of differentiation, e.g. "t".' },
      order: { type: 'number', description: 'Derivative order. Defaults to 1.' },
    },
    output: {
      schema: EXPRESSION_RESULT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: toolResultText(value) }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const order = args.order ?? 1
      const body = `expr = sp.sympify(${pyLiteral(args.expression)})
variable = sp.Symbol(${pyLiteral(args.variable)})
value = sp.diff(expr, variable, ${pyLiteral(order)})
return {"result": str(value), "latex": sp.latex(value)}`
      return runSympyScript<ExpressionResult>(ctx, body, exec.signal)
    },
  })
}

/** `solve_ode`: solves an ordinary differential equation for `function_name(variable_name)`. */
function defineSolveOdeTool(ctx: Context): ToolDefinition {
  return defineTool({
    name: 'sympy_solve_ode',
    description: 'Solve an ordinary differential equation using SymPy dsolve. Write the unknown function as e.g. "y(t)" and derivatives as "Derivative(y(t), t)" or "Derivative(y(t), t, 2)".',
    parameters: {
      equation: { type: 'string', required: true, description: 'ODE, e.g. "Derivative(y(t), t, 2) + y(t)" (implicitly "= 0") or "Derivative(y(t), t, 2) + y(t) = 0".' },
      function_name: { type: 'string', description: 'Unknown function name. Defaults to "y".' },
      variable_name: { type: 'string', description: 'Independent variable name. Defaults to "t".' },
    },
    output: {
      schema: EXPRESSION_RESULT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: toolResultText(value) }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const functionName = args.function_name ?? 'y'
      const variableName = args.variable_name ?? 't'
      const body = `t = sp.Symbol(${pyLiteral(variableName)})
y = sp.Function(${pyLiteral(functionName)})
equation_text = ${pyLiteral(args.equation)}
if "=" in equation_text:
    lhs_text, rhs_text = equation_text.split("=", 1)
    lhs = sp.sympify(lhs_text, locals={${pyLiteral(functionName)}: y, ${pyLiteral(variableName)}: t})
    rhs = sp.sympify(rhs_text, locals={${pyLiteral(functionName)}: y, ${pyLiteral(variableName)}: t})
    ode = sp.Eq(lhs, rhs)
else:
    ode = sp.sympify(equation_text, locals={${pyLiteral(functionName)}: y, ${pyLiteral(variableName)}: t})
solution = sp.dsolve(ode, y(t))
return {"result": str(solution), "latex": sp.latex(solution)}`
      return runSympyScript<ExpressionResult>(ctx, body, exec.signal)
    },
  })
}

/** Register the full symbolic-computation tool suite. */
export function applySympyTools(ctx: Context): void {
  ctx.tools.register(defineExpressionTool(ctx, 'factor', 'factor', 'Factor'))
  ctx.tools.register(defineExpressionTool(ctx, 'expand', 'expand', 'Expand'))
  ctx.tools.register(defineExpressionTool(ctx, 'simplify', 'simplify', 'Simplify'))
  ctx.tools.register(defineSolveTool(ctx))
  ctx.tools.register(defineIntegrateTool(ctx))
  ctx.tools.register(defineDifferentiateTool(ctx))
  ctx.tools.register(defineSolveOdeTool(ctx))
}
