/**
 * Cordis service (`ctx.mathPython`) resolving the project's Python interpreter and running
 * short-lived SymPy/SciPy/NumPy scripts as isolated child processes. Every math tool package
 * (tool-sympy, tool-verifier) depends on this seam instead of shelling out itself, so the
 * interpreter resolution (Conda/venv/system) and script lifecycle live in exactly one place.
 * @module @deriva/math-python
 */

import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    mathPython: MathPythonService
  }
}

/** One script run's captured outcome. A non-zero `exitCode` or non-empty `stderr` signals a Python-side failure, not a service failure. */
export interface MathPythonRunResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number | null
}

/**
 * Resolves and runs the project's Python interpreter. Resolution precedence:
 * `$VIRTUAL_ENV/bin/python3` → `$CONDA_PREFIX/bin/python3` → `./.venv/bin/python3` → system `python3`
 * (matches the project README's documented precedence for the math scientific stack).
 */
export class MathPythonService extends Service {
  private interpreter: string | undefined

  constructor(ctx: Context) {
    super(ctx, 'mathPython')
  }

  /** Resolve once and cache: repeated calls within one process never re-probe the filesystem. */
  async resolveInterpreter(): Promise<string> {
    if (this.interpreter !== undefined) return this.interpreter
    const candidates: string[] = []
    const virtualEnv = process.env['VIRTUAL_ENV']
    const condaPrefix = process.env['CONDA_PREFIX']
    if (virtualEnv !== undefined && virtualEnv !== '') candidates.push(join(virtualEnv, 'bin', 'python3'))
    if (condaPrefix !== undefined && condaPrefix !== '') candidates.push(join(condaPrefix, 'bin', 'python3'))
    candidates.push(join(process.cwd(), '.venv', 'bin', 'python3'))
    for (const candidate of candidates) {
      if (await isExecutableFile(candidate)) {
        this.interpreter = candidate
        return candidate
      }
    }
    // Bare 'python3' resolves through the ambient PATH at spawn time; no upfront
    // stat is possible without duplicating PATH search, so it is the unconditional
    // last resort and surfaces its own ENOENT from spawn() if truly absent.
    this.interpreter = 'python3'
    return this.interpreter
  }

  /**
   * Write `script` to a scratch file and run it with the resolved interpreter.
   * @param script - complete Python source (imports sympy/scipy/numpy itself).
   * @param signal - aborts the child process; an aborted run resolves with a
   *   `null` exit code rather than rejecting.
   */
  async run(script: string, signal?: AbortSignal): Promise<MathPythonRunResult> {
    const interpreter = await this.resolveInterpreter()
    const dir = await mkdtemp(join(tmpdir(), 'deriva-math-'))
    const scriptPath = join(dir, 'script.py')
    try {
      await writeFile(scriptPath, script, 'utf8')
      return await spawnCapture(interpreter, [scriptPath], signal)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
}

async function isExecutableFile(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.X_OK)
    return true
  } catch {
    return false
  }
}

function spawnCapture(command: string, args: readonly string[], signal: AbortSignal | undefined): Promise<MathPythonRunResult> {
  const { promise, resolve, reject } = Promise.withResolvers<MathPythonRunResult>()
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
  const onAbort = (): void => void child.kill('SIGTERM')
  signal?.addEventListener('abort', onAbort)
  child.on('error', (error) => {
    signal?.removeEventListener('abort', onAbort)
    reject(error)
  })
  child.on('close', (exitCode) => {
    signal?.removeEventListener('abort', onAbort)
    resolve({ stdout, stderr, exitCode })
  })
  return promise
}

export default MathPythonService
