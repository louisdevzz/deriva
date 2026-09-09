#!/usr/bin/env node
/**
 * Compile all workspace packages' src/ → lib/types/ before tsdown bundles them.
 * Only runs tsc for packages that have an outDir set in tsconfig.
 * Skips packages that already have a lib/types/ directory.
 * Skips test fixture directories.
 */
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(process.cwd())
const tsc = join(root, 'node_modules', '.bin', 'tsc')

function isFixtureDir(dir) {
  return dir.includes('/tests/') || dir.includes('/fixtures/')
}

function findPackageDirs() {
  const dirs = []
  function scanPackages(base) {
    if (!existsSync(base)) return
    let entries
    try { entries = readdirSync(base).sort() } catch { return }
    for (const entry of entries) {
      const full = join(base, entry)
      let st
      try { st = statSync(full) } catch { continue }
      if (!st.isDirectory()) continue
      if (entry === 'node_modules' || entry.startsWith('.')) continue
      if (isFixtureDir(full)) continue
      if (existsSync(join(full, 'package.json'))) dirs.push(full)
      scanPackages(full)
    }
  }
  scanPackages(join(root, 'packages'))
  scanPackages(join(root, 'vendor'))
  return dirs
}

/**
 * Returns the tsconfig file to use for building, or null if no build needed.
 * Checks tsconfig.json first, then tsconfig.host.json.
 */
function getBuildConfig(dir) {
  if (existsSync(join(dir, 'lib', 'types'))) return null

  // Try main tsconfig.json
  const mainTs = join(dir, 'tsconfig.json')
  if (existsSync(mainTs)) {
    try {
      const config = JSON.parse(readFileSync(mainTs, 'utf8'))
      if (config.compilerOptions?.outDir && config.compilerOptions?.noEmit !== true) {
        return mainTs
      }
      // Solution file? Check face configs
    } catch {}
  }

  // Try face-specific tsconfigs
  for (const face of ['tsconfig.host.json', 'tsconfig.client.json']) {
    const facePath = join(dir, face)
    if (existsSync(facePath)) {
      try {
        const config = JSON.parse(readFileSync(facePath, 'utf8'))
        if (config.compilerOptions?.outDir && config.compilerOptions?.noEmit !== true) {
          return facePath
        }
      } catch {}
    }
  }

  return null
}

const allDirs = findPackageDirs()
const toBuild = []
for (const dir of allDirs) {
  const config = getBuildConfig(dir)
  if (config) toBuild.push({ dir, config })
}

let built = 0, failed = 0
for (const { dir, config } of toBuild) {
  try {
    execSync(`${JSON.stringify(tsc)} -p ${JSON.stringify(config)} 2>&1`, {
      cwd: root,
      stdio: 'pipe',
    })
    built++
  } catch (e) {
    if (existsSync(join(dir, 'lib', 'types'))) {
      built++
    } else {
      failed++
      const stderr = (e.stderr?.toString() ?? e.stdout?.toString() ?? '').slice(0, 300)
      process.stderr.write(`FAIL ${dir}\n${stderr}\n`)
    }
  }
}

process.stdout.write(`build-lib: ${built} built, ${allDirs.length - toBuild.length} skipped, ${failed} failed\n`)
if (failed > 0) process.exit(1)
