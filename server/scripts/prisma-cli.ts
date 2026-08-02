import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const prismaCliPath = require.resolve('prisma/build/index.js')
const args = process.argv.slice(2)

const result = spawnSync(process.execPath, [prismaCliPath, ...args], {
  cwd: path.resolve(process.cwd()),
  stdio: 'inherit',
  env: process.env,
})

if (result.error) throw result.error
process.exitCode = result.status ?? 1
