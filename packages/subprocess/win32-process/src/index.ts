/**
 * Stub for Win32 process primitives — Linux does not use these.
 * Exports satisfy the type-level imports; runtime calls throw.
 */

const UNSUPPORTED = 'dsh-win32-process: not available on this platform'

export const ERROR_INSUFFICIENT_BUFFER = 122

export class Win32Error extends Error {
  constructor(public readonly win32Code: number, message?: string) {
    super(message ?? `Win32 error ${win32Code}`)
    this.name = 'Win32Error'
  }
}

export const WINDOWS_SPAWN_ERROR_CODES = new Map<number, string>()

export type NativePtr = unknown
export type CurrentTokenProcessBindings = unknown
export type Win32ProcessBindings = unknown
export type CurrentTokenStdioFileDescriptors = unknown
export type CurrentTokenProcessSpawnOptions = unknown
export type SpawnedJobProcess = unknown
export type SpawnedPipedProcess = unknown

function unsupported(): never { throw new Error(UNSUPPORTED) }

export const allocPtrSlot = unsupported
export const allocUint32 = unsupported
export const decodePtr = unsupported
export const decodeUint32 = unsupported
export const extendWin32ProcessBindings = unsupported
export const isNullPtr = unsupported
export const loadWin32ProcessBindings = unsupported
export const throwLastError = unsupported
export const throwWin32 = unsupported
export const closeHandleChecked = unsupported
export const drainPipe = unsupported
export const isJobEmpty = unsupported
export const pollProcessExit = unsupported
export const probeCurrentTokenJobSupport = (): false => false
export const spawnInheritedJobProcess = unsupported
export const spawnCurrentTokenJobProcess = unsupported
export const spawnPipedProcess = unsupported
export const terminateJob = unsupported
export const waitForProcessExit = unsupported
