import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tempRoot = path.resolve(serverDir, '..', '.data', 'temp')
fs.mkdirSync(tempRoot, { recursive: true })
const tempDir = fs.mkdtempSync(path.join(tempRoot, 'server-test-'))
const dbPath = path.join(tempDir, 'test.db').replace(/\\/g, '/')

const child = spawn('tsx --test test/*.test.ts', {
  cwd: serverDir,
  env: {
    ...process.env,
    SUPERAGENT_DATABASE_URL: `file:${dbPath}`,
  },
  shell: true,
  stdio: 'inherit',
  windowsHide: true,
})

child.on('exit', (code, signal) => {
  fs.rmSync(tempDir, { recursive: true, force: true })
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
