import { execFile } from 'node:child_process'
import type { Shell, ShellAction, ShellResult, ShellOutputResult } from '@openai/agents'

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
        isWin ? ['-NoProfile', '-Command', command] : ['-c', command],
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
            return {
              stdout: stdout.slice(0, maxLen),
              stderr: stderr.slice(0, maxLen),
              outcome: { type: 'exit', exitCode: typeof err?.code === 'number' ? err.code : null },
            }
          }
          resolve(resolveOutput())
        },
      )
    })
  }
}
