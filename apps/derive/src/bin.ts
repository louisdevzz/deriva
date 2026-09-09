#!/usr/bin/env node
/**
 * CLI entry for Deriva — Mathematical Derivation Agent (MDA).
 *
 * Boots the Cordis plugin tree using the DSH base bundle, applies the
 * math-derive patch layer on top, then runs either headless (one-shot)
 * or interactive (web UI) mode.
 *
 * @module @deriva/cli/bin
 */

import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { existsSync, writeFileSync, mkdirSync } from 'node:fs'
import {
  boot,
  installFailLoud,
  loadLayeredEnv,
  loadOverlayPatches,
  type PatchOptions,
} from '@deepseek-ai/dsh-app-boot'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { DSH_LAUNCH_ENVIRONMENT_KEY } from '@deepseek-ai/dsh-launch-environment'
import type { Context } from '@deepseek-ai/cordis'

const NAME = 'deriva'

// Resolve paths relative to this file (works from both src/ and built lib/)
const APP_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(APP_DIR, '..', '..', '..')

/** Parse minimal CLI args. */
function parseArgs(argv: string[]): { task?: string; profile: string; rest: string[] } {
  let profile = 'headless'
  let task: string | undefined
  const rest: string[] = []
  let argsList = [...argv]

  if (argsList[0] === 'web') {
    profile = 'web'
    argsList = argsList.slice(1)
  }

  for (let i = 0; i < argsList.length; i++) {
    const arg = argsList[i]!
    if (arg === '--profile' && i + 1 < argsList.length) {
      profile = argsList[++i]!
    } else {
      rest.push(arg)
    }
  }

  if (profile === 'headless' && rest.length > 0) {
    task = rest.join(' ')
  }

  return { task, profile, rest }
}

/**
 * Resolve bundle patch layers:
 *   1. dsh-base (core plugins)
 *   2. headless or web-app patch depending on profile
 *   3. math-derive patch (customizations win over defaults)
 */
function composePatchStack(profile: string): PatchOptions[] {
  const basePatch = join(REPO_ROOT, 'packages/bundle/base/cordis.patch.yml')
  const mathPatch = join(APP_DIR, '..', 'config', 'math-derive.cordis.patch.yml')

  const patches: PatchOptions[] = [
    ...loadOverlayPatches(NAME, basePatch),
  ]

  if (profile === 'headless') {
    const headlessPatch = join(REPO_ROOT, 'packages/bundle/headless/cordis.patch.yml')
    patches.push(...loadOverlayPatches(NAME, headlessPatch))
  } else if (profile === 'web') {
    const webPatch = join(REPO_ROOT, 'packages/bundle/web-app/cordis.patch.yml')
    patches.push(...loadOverlayPatches(NAME, webPatch))
  }

  // math-derive patch applies last so our system-prompt and model choices win
  patches.push(...loadOverlayPatches(NAME, mathPatch))

  return patches
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const environment = loadLayeredEnv(NAME)

  if (args.profile === 'headless' && !args.task) {
    process.stderr.write(`Usage: deriva "<math problem>"\n`)
    process.stderr.write(`       deriva "Derive x(t) from F=ma for constant force"\n`)
    process.exit(1)
  }

  // Create a minimal config root (empty entry list the patches overlay)
  const configDir = join(APP_DIR, '..', '.runtime')
  mkdirSync(configDir, { recursive: true })
  const configPath = join(configDir, 'cordis.yml')
  if (!existsSync(configPath)) {
    writeFileSync(configPath, '# deriva runtime root — patches compose over this.\n[]\n')
  }

  const patches = composePatchStack(args.profile)

  const shutdown = {
    requested: false,
    code: 0,
    resolve: undefined as (() => void) | undefined,
    promise: undefined as Promise<void> | undefined,
    shutdown(code: number): void {
      this.code = code
      this.requested = true
      this.resolve?.()
    },
    interrupt(code: number): void {
      this.shutdown(code)
    },
  }
  shutdown.promise = new Promise<void>((r) => { shutdown.resolve = r })

  let app: Context | undefined

  installFailLoud(NAME, process, async () => {
    await app?.fiber.dispose()
  })

  process.on('SIGTERM', () => { shutdown.interrupt(0) })
  process.on('SIGINT', () => { shutdown.interrupt(130) })

  const ctx = await boot(NAME, configPath, patches, (hostCtx: Context) => {
    app = hostCtx
    hostCtx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, environment)
    provideCmdline(hostCtx, {
      args: args.profile === 'web' ? args.rest : (args.task ? [args.task] : []),
      exit: (code: number) => void shutdown.shutdown(code),
      ready: { ready: false, commit() { this.ready = true } },
    })
  })

  app = ctx

  if (args.profile === 'headless') {
    // Headless runner plugin picks up the task from headlessStartup service.
    // Wait for it to request exit.
    await shutdown.promise
    await ctx.fiber.dispose()
    process.exit(shutdown.code)
  } else {
    // Interactive mode — keep running until signal
    process.stderr.write(`${NAME}: running in ${args.profile} mode\n`)
    await shutdown.promise
    await ctx.fiber.dispose()
    process.exit(shutdown.code)
  }
}

await main()
