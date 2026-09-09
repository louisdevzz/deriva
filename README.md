<a id="readme-top"></a>

<!-- PROJECT SHIELDS -->
<div align="center">

[![License: Proprietary][license-shield]][license-url]
[![TypeScript][typescript-shield]][typescript-url]
[![Node.js][node-shield]][node-url]
[![Python][python-shield]][python-url]
[![SymPy][sympy-shield]][sympy-url]
[![Cordis][cordis-shield]][cordis-url]
[![Platform][platform-shield]][platform-url]

</div>

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <h1 align="center">Deriva (MDA)</h1>
  <h3 align="center">Mathematical Derivation Agent</h3>

  <p align="center">
    An autonomous, rigorous mathematical derivation harness powered by the DeepSeek Harness platform core, local reasoning models, and deterministic symbolic verifiers.
    <br />
    <br />
    <strong>PLAN</strong> &bull; <strong>EXECUTE</strong> &bull; <strong>VERIFY</strong> &bull; <strong>COMMIT</strong>
    <br />
    <br />
    <a href="#about-the-project"><strong>Explore the Architecture &raquo;</strong></a>
    &middot;
    <a href="#getting-started">Getting Started</a>
    &middot;
    <a href="#usage">Usage Examples</a>
    &middot;
    <a href="#roadmap">Roadmap</a>
  </p>
</div>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#core-philosophy">Core Philosophy</a></li>
        <li><a href="#the-derivation-loop">The Derivation Loop</a></li>
        <li><a href="#system-architecture">System Architecture</a></li>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
        <li><a href="#environment-configuration">Environment Configuration</a></li>
      </ul>
    </li>
    <li>
      <a href="#usage">Usage</a>
      <ul>
        <li><a href="#cli-derivation-mode">CLI Derivation Mode</a></li>
        <li><a href="#structured-derivation-artifacts">Structured Derivation Artifacts</a></li>
        <li><a href="#verification-pipeline">Verification Pipeline</a></li>
      </ul>
    </li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

<!-- ABOUT THE PROJECT -->
## About The Project

**Deriva (MDA)** is a dedicated autonomous agent designed to solve advanced mathematical, physical, and scientific derivation problems with mathematical rigor. 

General-purpose LLMs excel at qualitative reasoning but frequently hallucinate in algebraic manipulation, loss of negative signs, integration constants, boundary conditions, and matrix algebra. Conversely, Computer Algebra Systems (CAS) such as SymPy or Mathematica execute exact computation but lack strategic planning, natural language comprehension, and physical intuition.

**Deriva bridges this gap** by treating the reasoning LLM as a *strategic derivation planner* and delegating all algebraic and analytic computations to deterministic engines with verification gates.

```
                    ┌─────────────────────────┐
                    │      User Problem       │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │   Deriva Agent Core     │
                    │ (Strategy, Assumptions) │
                    └────────────┬────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
          ▼                      ▼                      ▼
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│   SymPy / CAS    │   │  Numeric Verifier│   │  Dimension Check │
│ (Algebra, ODEs)  │   │  (Euler/RK Spot) │   │ (SI Unit Constr) │
└─────────┬────────┘   └─────────┬────────┘   └─────────┬────────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │  Verified Derivation    │
                    │  x(t) = x₀ + v₀t + ...  │
                    └─────────────────────────┘
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Core Philosophy

1. **LLM is a Planner, Not a Calculator**: The model plans strategy, formulates sub-problems, interprets results, and explains steps. Complex algebra is never performed through unverified mental arithmetic.
2. **Deterministic Verification Before Acceptance**: Every intermediate lemma and final solution must pass multi-layered verification before being committed.
3. **Structured State Outside Context Window**: Derivation state is stored in persistent, versioned artifacts (`math-state.json`, `derivation-graph.json`) rather than purely in conversational chat history.
4. **Local Hardware First**: Designed to run natively on dedicated workstation hardware (e.g., dual NVIDIA RTX 5090) with high-throughput local reasoning models.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### The Derivation Loop

Deriva operates on a four-phase state machine:

$$\boxed{\text{PLAN} \longrightarrow \text{EXECUTE} \longrightarrow \text{VERIFY} \longrightarrow \text{COMMIT}}$$

| Phase | Responsibility | Engine / Executor |
|---|---|---|
| **PLAN** | Identify known quantities, unknowns, constraints, and valid domains; select derivation strategy | LLM (DeepSeek-Reasoner / Qwen) |
| **EXECUTE** | Perform step-by-step mathematical transformations, integrations, and substitutions | SymPy / SciPy Tools |
| **VERIFY** | Validate against ODE residuals, initial/boundary conditions, numerical spot checks, and dimensional consistency | Deterministic Verifier Suite |
| **COMMIT** | Record step, mathematical formula, justification, and verification certificate to derivation state | Persistent Math State & Artifacts |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### System Architecture

Deriva is built on a clean three-tier architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                       Deriva CLI & App                      │
│                                                             │
│  apps/derive/src/bin.ts          CLI entry & lifecycle       │
│  apps/derive/src/runner.ts       Derivation loop driver     │
│  apps/derive/config/             Cordis math overlay patch  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                Layered Cordis Patch Hierarchy
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    DSH Platform Core                        │
│                                                             │
│  packages/core/agent-loop        Agent turn execution loop  │
│  packages/core/session           Persistent event logs      │
│  packages/llm/llm                Provider-neutral LLM engine│
│  packages/fs/* & sandbox/*       Confined workspace tools   │
│  packages/client/* & apps/web    Interactive Web UI shell   │
│  packages/web/*                  Scientific web search tools│
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     Foundational Microkernel                │
│                                                             │
│  vendor/cordis                   Service injection kernel   │
│  vendor/loader & include         Dynamic plugin composition │
│  native/system                   High-perf POSIX flock      │
└─────────────────────────────────────────────────────────────┘
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Built With

* [![TypeScript][typescript-badge]][typescript-url]
* [![Node.js][node-badge]][node-url]
* [![Python][python-badge]][python-url]
* [![SymPy][sympy-badge]][sympy-url]
* [![React][react-badge]][react-url]
* [![Vite][vite-badge]][vite-url]
* [![pnpm][pnpm-badge]][pnpm-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- GETTING STARTED -->
## Getting Started

### Prerequisites

* **Node.js**: `^22.19.0` or `>=24.0.0`
  ```sh
  node --version
  ```
* **pnpm**: `>=11.7.0`
  ```sh
  npm install -g pnpm@latest
  ```
* **Python**: `>=3.10` with development headers and venv support
  ```sh
  python3 --version
  ```
* **C Compiler**: `gcc` / `clang` with Node development headers for native flock addon build
  ```sh
  sudo apt-get install build-essential python3-dev
  ```

### Installation

1. Clone or access the private repository:
   ```sh
   cd /home/louis/deriva
   ```
2. Install workspace dependencies:
   ```sh
   pnpm install
   ```
3. Build the native platform addon (Linux x64):
   ```sh
   cd native/system && node --import tsx scripts/build.ts --host-addon-only && cd ../..
   ```
4. Verify the build:
   ```sh
   pnpm derive
   ```
   *Expected output: CLI usage instructions.*

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Environment Configuration

Create a `.env` file in the project root:

```env
# Primary LLM API Credentials
DEEPSEEK_API_KEY=your_deepseek_api_key_here

# Local Model Provider (e.g., vLLM / Ollama on RTX 5090)
LOCAL_LLM_BASE_URL=http://127.0.0.1:8000/v1
LOCAL_LLM_MODEL=Qwen/Qwen2.5-Math-72B-Instruct

# Execution & Sandbox Configuration
DSH_PERMISSION_MODE=danger-full-access
DSH_TOOLS_MODE=worker-thread
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- USAGE EXAMPLES -->
## Usage

### CLI Derivation Mode

Run a one-shot mathematical derivation by providing the problem statement as a command-line argument:

```sh
pnpm derive "Derive the displacement x(t) for a particle of mass m under constant force F with initial position x0 and initial velocity v0."
```

#### Real-time Progress
During execution, Deriva streams:
* **Reasoning trace** (`[derive: reasoning]`) displaying hypothesis formation and strategy planning.
* **Tool calls** executing Python/SymPy scripts to solve differential equations, expand polynomials, and verify residuals.
* **Verification matrix** certifying ODE residuals, initial conditions, Euler numeric spot checks, and dimensional sanity.

```
[deriva] Model: deepseek-official/deepseek-reasoner
[deriva] Task: Derive the displacement x(t) for a particle of mass m...

## Derivation

Given: mass m, constant force F, initial position x₀, initial velocity v₀.
Governing equation (Newton's second law, 1D, m > 0):

  m · x''(t) = F

Step 1 — Constant acceleration:
  x''(t) = a ≡ F/m

Step 2 — First integration (apply x'(0) = v₀):
  x'(t) = v₀ + (F/m) · t

Step 3 — Second integration (apply x(0) = x₀):
  x(t) = x₀ + v₀ · t + (F / 2m) · t²

  ┌─────────────────────────────────────────────────┐
  │   x(t) = x₀ + v₀ · t + (F / 2m) · t²            │
  └─────────────────────────────────────────────────┘
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Structured Derivation Artifacts

Upon completing each derivation, Deriva writes a structured report to disk (e.g. `displacement_derivation.md` or `.derive/math-state.json`):

```json
{
  "problem": "Derive x(t) from F=ma under constant force F",
  "assumptions": [
    "1D motion in an inertial frame",
    "m, F, x0, v0 are real constants with m > 0",
    "Force is time-independent: F(t) ≡ F"
  ],
  "known": [
    "Newton's second law: m · x''(t) = F",
    "Initial conditions: x(0) = x0, x'(0) = v0"
  ],
  "derived": [
    {
      "step": 1,
      "statement": "Constant acceleration",
      "expression": "a = F / m",
      "verified": true
    },
    {
      "step": 2,
      "statement": "Velocity function",
      "expression": "v(t) = v0 + (F / m) * t",
      "verified": true
    },
    {
      "step": 3,
      "statement": "Displacement function",
      "expression": "x(t) = x0 + v0 * t + (F / (2 * m)) * t^2",
      "verified": true
    }
  ],
  "goals": [],
  "status": "completed"
}
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Verification Pipeline

Deriva's verifier evaluates each result against four distinct criteria:

1. **Symbolic Exactness**: Evaluates the differential operator residual via SymPy:
   $$\mathcal{L}[x(t)] - f(t) \equiv 0$$
2. **Initial & Boundary Conditions**: Directly computes limits and substitutions:
   $$\lim_{t \to 0^+} x(t) \stackrel{?}{=} x_0, \quad \lim_{t \to 0^+} \dot{x}(t) \stackrel{?}{=} v_0$$
3. **Numerical Spot Checking**: High-resolution numerical integration (Runge-Kutta / Euler with $200\,000+$ steps) compared against the analytical closed-form solution.
4. **Dimensional Consistency**: Checks that each additive term in the derived expression possesses identical physical dimensions:
   $$[x_0] = [L], \quad [v_0 t] = [L], \quad \left[\frac{F}{2m} t^2\right] = [L]$$

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ROADMAP -->
## Roadmap

- [x] **Phase 1: Foundation & Text/LaTeX MVP**
  - [x] Extraction and isolation of DeepSeek Harness platform core
  - [x] Layered Cordis patch architecture for math derivation presets
  - [x] Structured Derivation Runner with reasoning streaming
  - [x] Automatic SymPy sandbox integration and verification loop
  - [x] 100% standalone workspace with local Node-API build
- [ ] **Phase 2: Scientific Document Ingestion**
  - [ ] Math-aware parser for PDF / DOCX papers
  - [ ] Automatic extraction of governing equations, definitions, and theorems
  - [ ] OCR-to-LaTeX pipeline with equation alignment
  - [ ] Interactive Web Workspace mode for visual derivation tree exploration
- [ ] **Phase 3: Research-Grade Autonomous Derivation**
  - [ ] Multi-hypothesis backtracking and branch exploration
  - [ ] Non-linear coupled partial differential equation (PDE) solving
  - [ ] Formal proof checking integration (Lean 4 / Isabelle bridge)
  - [ ] Multi-agent peer review: Proposer $\longleftrightarrow$ Critic $\longleftrightarrow$ Verifier

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTRIBUTING -->
## Contributing

This is a **private, proprietary repository**. Internal contributions are governed by engineering standards:

1. **Branch Naming**:
   * `feat/<feature-name>` for new functionality
   * `fix/<issue-name>` for bug fixes
   * `perf/<area>` for performance enhancements
2. **Coding Standards**:
   * Strict TypeScript (`tsc -b tsconfig.json`) with zero type errors.
   * Do not commit compiled artifacts (`lib/`, `dist/`, `*.tsbuildinfo`).
   * Adhere to RFC 2119 criteria for all verification protocols.
3. **Pull Request Protocol**:
   * All pull requests must include verification evidence (CLI derivation run log or unit tests).
   * Request review from the core maintainer.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- LICENSE -->
## License

**PROPRIETARY AND CONFIDENTIAL**

Copyright &copy; 2026. All rights reserved.

Unauthorized copying of this repository, its architecture, or its source files, via any medium, is strictly prohibited. This software is proprietary to the author and authorized organizations.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTACT -->
## Contact

**Project Lead**: Louis  
**Project Repository**: `deriva` (Deriva MDA)  
**Classification**: Proprietary / Internal Research

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ACKNOWLEDGMENTS -->
## Acknowledgments

* [DeepSeek Harness (`deepseek-ai/deepseek-harness`)][dsh-url] — Platform architecture, Cordis composition, and session subsystem
* [Cordis Framework][cordis-url] — Extensible microkernel architecture
* [SymPy][sympy-url] — Symbolic mathematics in Python
* [Best-README-Template][best-readme-url] — For the documentation design and structure

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- MARKDOWN LINKS & IMAGES -->
[license-shield]: https://img.shields.io/badge/License-Proprietary-red.svg?style=for-the-badge
[license-url]: #license
[typescript-shield]: https://img.shields.io/badge/TypeScript-5.x%20%2F%206.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[typescript-url]: https://www.typescriptlang.org/
[node-shield]: https://img.shields.io/badge/Node.js-%3E%3D22.19-339933?style=for-the-badge&logo=node.js&logoColor=white
[node-url]: https://nodejs.org/
[python-shield]: https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white
[python-url]: https://www.python.org/
[sympy-shield]: https://img.shields.io/badge/CAS-SymPy-3B5526?style=for-the-badge
[sympy-url]: https://www.sympy.org/
[cordis-shield]: https://img.shields.io/badge/Microkernel-Cordis-7B2CBF?style=for-the-badge
[cordis-url]: https://cordis.moe/
[platform-shield]: https://img.shields.io/badge/Platform-Linux%20x64-FCC624?style=for-the-badge&logo=linux&logoColor=black
[platform-url]: https://kernel.org/

[typescript-badge]: https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[node-badge]: https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white
[python-badge]: https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white
[sympy-badge]: https://img.shields.io/badge/SymPy-3B5526?style=for-the-badge
[react-badge]: https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[react-url]: https://reactjs.org/
[vite-badge]: https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white
[vite-url]: https://vitejs.dev/
[pnpm-badge]: https://img.shields.io/badge/pnpm-F69220?style=for-the-badge&logo=pnpm&logoColor=white
[pnpm-url]: https://pnpm.io/

[dsh-url]: https://github.com/deepseek-ai/deepseek-harness
[best-readme-url]: https://github.com/othneildrew/Best-README-Template
