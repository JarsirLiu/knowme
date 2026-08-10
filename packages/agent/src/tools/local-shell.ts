import { execFile } from 'node:child_process'
import type { Shell, ShellAction, ShellResult, ShellOutputResult } from '@openai/agents'

const UTF8_OUTPUT_PREFIX =
  'try { [Console]::OutputEncoding=[System.Text.Encoding]::UTF8 } catch {}\n'

const FILE_READ_RE = /^[\s]*(?:Get-Content|cat)\s+(.+)$/

function normalizeCommand(command: string): string {
  const trimmed = command.trimStart()
  if (!trimmed.startsWith(UTF8_OUTPUT_PREFIX)) {
    command = UTF8_OUTPUT_PREFIX + command
  }
  const m = FILE_READ_RE.exec(command.replace(UTF8_OUTPUT_PREFIX, ''))
  if (m) {
    const path = m[1].trimEnd()
    return `${UTF8_OUTPUT_PREFIX}Get-Content -Encoding UTF8 -Raw ${path}`
  }
  return command
}

export class LocalShell implements Shell {
  private readonly workspace: string

  constructor(workspace: string) {
    this.workspace = workspace
  }

  async run(action: ShellAction, signal?: AbortSignal): Promise<ShellResult> {
    const output: ShellOutputResult[] = []
    for (const cmd of action.commands) {
      const result = await this.execCommand(cmd, action.timeoutMs, action.maxOutputLength, signal)
      output.push(result)
    }
    return { output, maxOutputLength: action.maxOutputLength }
  }

  private execCommand(
    command: string,
    timeoutMs?: number,
    maxOutputLength?: number,
    signal?: AbortSignal,
  ): Promise<ShellOutputResult> {
    return new Promise((resolve) => {
      const isWin = process.platform === 'win32'
      const child = execFile(
        isWin ? 'powershell.exe' : (process.env.SHELL || 'sh'),
        isWin
          ? ['-NoProfile', '-Command', normalizeCommand(command)]
          : ['-c', command],
        {
          cwd: this.workspace,
          timeout: timeoutMs ?? 120_000,
          signal,
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024,
        },
        (err, stdout, stderr) => {
          const maxLen = maxOutputLength ?? 8000
          const resolveOutput = (): ShellOutputResult => {
            if (err?.signal === 'SIGTERM' || err?.name === 'AbortError' || err?.code === 'ABORT_ERR') {
              return { stdout: stdout.slice(0, maxLen), stderr: stderr.slice(0, maxLen), outcome: { type: 'timeout' } }
            }
            let errorText = stderr.slice(0, maxLen)
            if (!errorText && err) {
              if (err.code === 'ENOENT') {
                errorText = `Command failed: working directory not found (${this.workspace}). The project directory may have been deleted or renamed.`
              } else {
                errorText = err.message ? err.message.slice(0, maxLen) : ''
              }
            }
            return {
              stdout: stdout.slice(0, maxLen),
              stderr: errorText,
              outcome: { type: 'exit', exitCode: err ? 1 : null },
            }
          }
          resolve(resolveOutput())
        },
      )
    })
  }
}
