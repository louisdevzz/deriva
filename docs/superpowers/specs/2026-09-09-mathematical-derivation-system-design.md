# Mathematical Derivation System Specification & Architectural Design

**Date**: 2026-09-09  
**Status**: Proposal / Under Review  
**Target Repository**: `/home/louis/deriva`  
**Reference Platform**: DeepSeek Harness Core (`@deepseek-ai/dsh-*`)

---

## 1. Executive Summary & Problem Statement

### 1.1 Problem Statement
In the initial MVP of Deriva (`apps/derive`), the agent relied on generic tools (`tool-bash` and `tool-fs`) to execute mathematical computations. In this setup, the LLM generated arbitrary Python scripts using Bash commands (`python -c "..."`) to interact with SymPy and SciPy. 

This approach presented critical architectural drawbacks:
1. **High Token & Context Waste**: The LLM spent tokens generating repetitive Python imports, error-handling boilerplate, and terminal formatting.
2. **String Escaping & Syntax Brittleness**: Complex mathematical formulas, Greek letters, and LaTeX strings frequently failed due to shell quote escaping.
3. **Absence of Strict Verification Gates**: The LLM acted as both solver and verifier, creating risks of hallucinated verifications.
4. **Lack of Web UI Integration**: While the DSH Web UI exists in the workspace, there was no dedicated `mathematical` agent preset, and `apps/derive` only supported a headless CLI profile.

### 1.2 Objective
Design and implement a first-class mathematical derivation architecture:
1. **Mathematical Tool Plugins**: Dedicated Cordis tool plugins (`tool-sympy`, `tool-scipy`, `tool-verifier`, and `tool-math-state`) with strict input/output schemas.
2. **Python Worker Daemon (`math-bridge`)**: A persistent Python worker running SymPy/SciPy with fast JSON-RPC IPC over stdio (<5ms execution latency).
3. **Deterministic Verifier Module**: An independent verification gate evaluating ODE residuals, initial conditions, numerical cross-checks (RK45), and dimensional consistency.
4. **Structured Derivation State & DAG**: Persistent state tracking known quantities, assumptions, step justifications, and open goals.
5. **Full Web UI Port & Dedicated Preset**: Complete support for `pnpm derive:web` and a `mathematical` preset selectable directly in the browser interface.

---

## 2. Overall Architecture

```
                                  USER INTERFACES
                 ┌────────────────────────────────────────────────┐
                 │  CLI: pnpm derive     │   Web UI: :3888 / :3080│
                 │  (apps/derive)        │   (packages/bundle/web)│
                 └───────────────┬────────────────┬───────────────┘
                                 │                │
                                 ▼                ▼
                 ┌────────────────────────────────────────────────┐
                 │              Cordis Microkernel                │
                 │             Agent Preset Engine                │
                 │       (presets/mathematical/agent.cordis.yml)  │
                 └───────────────────────┬────────────────────────┘
                                         │
                                         ▼
                 ┌────────────────────────────────────────────────┐
                 │       Mathematical Derivation Subsystems       │
                 │                                                │
                 │  [tool-math-state]  ── Derivation DAG & Goals │
                 │  [tool-sympy]       ── CAS / Symbolic Algebra  │
                 │  [tool-scipy]       ── Numerical IVP / RK45    │
                 │  [tool-verifier]    ── Deterministic Gate      │
                 └───────────────────────┬────────────────────────┘
                                         │ JSON-RPC IPC (Stdio)
                                         ▼
                 ┌────────────────────────────────────────────────┐
                 │     math-bridge: Python Worker Daemon          │
                 │     (Conda 'deriva' Python 3.11 Runtime)       │
                 │                                                │
                 │  - SymPy 1.14.0 (Algebra, ODE, Calculus)       │
                 │  - SciPy 1.17.1 (solve_ivp, RK45 spot checks)  │
                 │  - NumPy 2.4.6 & mpmath 1.3.0                  │
                 └────────────────────────────────────────────────┘
```

---

## 3. Subsystem Specifications

### 3.1 Component A: Python Daemon Bridge (`packages/math/math-bridge`)
- **Location**: `packages/math/math-bridge`
- **Cordis Service Name**: `mathBridge`
- **Responsibilities**:
  - Automatically resolves the Python runtime according to priority:
    1. `/home/louis/miniconda3/envs/deriva/bin/python` (Conda env)
    2. `$CONDA_PREFIX/bin/python` or `$VIRTUAL_ENV/bin/python`
    3. System `python3`
  - Spawns and manages a persistent daemon process (`packages/math/math-bridge/python/worker.py`).
  - Implements NDJSON/JSON-RPC communication over stdin/stdout.
  - Monitors worker health, enforces 15s calculation deadlines, and auto-restarts the worker upon crashes or out-of-memory events.

#### IPC Protocol Framing
- **Node $\to$ Python (Request)**:
  ```json
  {
    "id": "call-1",
    "method": "sympy.solve_ode",
    "params": {
      "equation": "m*Derivative(x(t), t, 2) - F",
      "function": "x(t)",
      "ics": { "x(0)": "x0", "Derivative(x(t), t).subs(t, 0)": "v0" }
    }
  }
  ```
- **Python $\to$ Node (Response)**:
  ```json
  {
    "id": "call-1",
    "result": {
      "status": "ok",
      "expression": "x0 + v0*t + F*t**2/(2*m)",
      "latex": "x_{0} + v_{0} t + \\frac{F t^{2}}{2 m}"
    }
  }
  ```

---

### 3.2 Component B: Symbolic Computation (`packages/math/tool-sympy`)
- **Location**: `packages/math/tool-sympy`
- **Exposed Tools**:
  1. `sympy_solve_ode`:
     - **Parameters**: `equation` (string), `target_function` (string), `ics` (optional object).
     - **Output**: `{ solution: string, latex: string, classification: string }`.
  2. `sympy_integrate`:
     - **Parameters**: `expression` (string), `variable` (string), `lower_limit` (optional string/number), `upper_limit` (optional string/number).
     - **Output**: `{ result: string, latex: string }`.
  3. `sympy_differentiate`:
     - **Parameters**: `expression` (string), `variable` (string), `order` (optional integer, default 1).
     - **Output**: `{ result: string, latex: string }`.
  4. `sympy_simplify`:
     - **Parameters**: `expression` (string), `strategy` (optional enum: `"general" | "trig" | "expand" | "factor"`).
     - **Output**: `{ simplified: string, latex: string, is_zero: boolean }`.

---

### 3.3 Component C: Numerical Engine (`packages/math/tool-scipy`)
- **Location**: `packages/math/tool-scipy`
- **Exposed Tools**:
  1. `scipy_solve_ivp`:
     - **Parameters**:
       - `ode_system`: string expression or list of first-order ODEs.
       - `t_span`: `[number, number]`.
       - `y0`: initial state vector (`number[]`).
       - `params`: parameter mapping (`Record<string, number>`).
       - `method`: enum (`"RK45" | "DOP853" | "Radau"`).
     - **Output**:
       - `{ t: number[], y: number[][], success: boolean, message: string }`.

---

### 3.4 Component D: Deterministic Verifier Module (`packages/math/tool-verifier`)
- **Location**: `packages/math/tool-verifier`
- **Exposed Tools**:
  1. `verify_ode_residual`:
     - Evaluates whether $\mathcal{L}[x_{sol}(t)] - f(t) \equiv 0$ symbolically using SymPy.
     - **Output**: `{ passed: boolean, residual: string, is_identically_zero: boolean }`.
  2. `verify_initial_conditions`:
     - Substitutes initial boundaries (e.g. $t \to 0$) into candidate solution and compares with known initial values.
     - **Output**: `{ passed: boolean, comparisons: Record<string, { expected: string, actual: string, match: boolean }> }`.
  3. `verify_numeric_spot`:
     - Generates random parameter samples within declared domains, runs high-precision numerical integration via SciPy `solve_ivp`, and evaluates $\max |x_{symbolic}(t) - x_{numeric}(t)|$.
     - **Output**: `{ passed: boolean, max_residual: number, tolerance: number, sample_parameters: Record<string, number> }`.
  4. `verify_dimensions`:
     - Validates physical dimension balance (e.g. SI units) across all additive terms.
     - **Output**: `{ passed: boolean, terms: Record<string, string>, dimensions_match: boolean }`.

---

### 3.5 Component E: Derivation State & DAG Engine (`packages/math/tool-math-state`)
- **Location**: `packages/math/tool-math-state`
- **Exposed Tools**:
  1. `math_state_update`:
     - Atomically updates and persists the derivation state DAG in `.derive/math-state.json`.
     - Fields:
       - `knowns`: Established facts and given problem constraints.
       - `assumptions`: Mathematical/physical assumptions with domains (e.g. $m > 0, t \geq 0$).
       - `steps`: Directed acyclic graph nodes containing:
         - `id`: Unique step identifier (e.g. `step-1`).
         - `statement`: Plain-text rationale.
         - `expression`: LaTeX and symbolic formula.
         - `derived_from`: Parent step IDs.
         - `verification`: Reference to certificate from `tool-verifier`.
       - `goals`: Remaining target proofs or expressions.
       - `status`: `"in_progress" | "completed" | "failed"`.

---

## 4. Web UI Integration & Mathematical Preset

### 4.1 Web UI Port Verification
The DSH Web UI infrastructure is integrated and operational in `deriva`:
- `apps/web/dist` contains the pre-built single-page application.
- All client packages (`@deepseek-ai/dsh-client-*`) and client bundles have been compiled and linked.
- `apps/derive/src/bin.ts` supports both `--profile headless` and `--profile web`.
- Verified launch command: `pnpm derive:web --port 3888` successfully binds loopback and serves the complete authenticated GUI.

### 4.2 Dedicated Preset: `presets/mathematical/`
- **Directory**: `packages/preset/agent-presets/presets/mathematical/`
- **`preset.yml`**:
  ```yaml
  id: mathematical
  name: Mathematical Derivation
  description: Autonomous mathematical and physical derivation agent with deterministic SymPy/SciPy verification gates.
  icon: function
  tags: [math, physics, derivation, sympy, scipy]
  ```
- **`agent.cordis.yml`**:
  - Mounts:
    - `@deepseek-ai/dsh-math-bridge`
    - `@deepseek-ai/dsh-tool-sympy`
    - `@deepseek-ai/dsh-tool-scipy`
    - `@deepseek-ai/dsh-tool-verifier`
    - `@deepseek-ai/dsh-tool-math-state`
  - Injects specialized mathematical system prompt (`PLAN -> EXECUTE -> VERIFY -> COMMIT`).
  - Disables generic shell tools (`tool-bash`) in default mathematical sessions to ensure pure structured tool usage.

---

## 5. Verification & Testing Plan

1. **Unit Tests (`vitest`)**:
   - `packages/math/math-bridge`: Test daemon process spawn, IPC request/response, timeout handling, and automatic restart on crash.
   - `packages/math/tool-sympy`: Test ODE solving, integration, differentiation, and simplification against known mathematical ground truth.
   - `packages/math/tool-verifier`: Test residual zero-checks, initial condition matching, and RK45 spot-checking.
   - `packages/math/tool-math-state`: Test DAG validity, cycle prevention, and state persistence.
2. **Integration & End-to-End Tests**:
   - **CLI Derivation Smoke Test**:
     ```bash
     pnpm derive "Derive the displacement x(t) for a particle of mass m under constant force F with initial position x0 and initial velocity v0."
     ```
     Verify that `tool-sympy` and `tool-verifier` are called rather than `tool-bash`.
   - **Web UI Preset Test**:
     Boot Web UI (`pnpm derive:web --no-open`), query the preset API endpoint, and verify that `mathematical` preset is listed and loadable.
