import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

// Only explicit public provenance fields: never copy environment variables.
const git = args => {
  try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() }
  catch { return null }
}
const sha = process.env.VERCEL_GIT_COMMIT_SHA || git(['rev-parse', 'HEAD'])
const manifest = {
  repository: 'IntoTheWild-Dev/wild-cast',
  commit: /^[a-f0-9]{40}$/.test(sha || '') ? sha : null,
  branch: process.env.VERCEL_GIT_COMMIT_REF || git(['branch', '--show-current']),
  dirty: git(['status', '--porcelain', '--untracked-files=no']) !== '',
  builtAt: new Date().toISOString(),
}
writeFileSync(new URL('../dist/release.json', import.meta.url), JSON.stringify(manifest, null, 2) + '\n')
