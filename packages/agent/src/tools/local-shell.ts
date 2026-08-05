import { execFile } from 'node:child_process'
import type { Shell, ShellAction, ShellResult, ShellOutputResult } from '@openai/agents'

export class LocalShell implements Shell {
  private readonly workspace: string

  constructor(workspace: string) {
    this.workspace = workspace
  }

  async run(action: ShellAction): Promise<ShellResult> {
    const output: ShellOutputResult[] = []
    for (const cmd of action.commands) {
      const result = await this.execCommand(cmd, action.timeoutMs, action.maxOutputLength)
      output.push(result)
    }
    return { output, maxOutputLength: action.maxOutputLength }
  }

  private execCommand(
    command: string,
    timeoutMs?: number,
    maxOutputLength?: number,
  ): Promise<ShellOutputResult> {
    return new Promise((resolve) => {
      const child = execFile(
        process.env.SHELL || process.env.ComSpec || 'cmd.exe',
        process.env.ComSpec ? ['/d', '/s', '/c', command] : ['-c', command],
        {
          cwd: this.workspace,
          timeout: timeoutMs ?? 120_000,
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024,
        },
        (err, stdout, stderr) => {
          const maxLen = maxOutputLength ?? 8000
          const resolveOutput = (): ShellOutputResult => {
            if (err?.code === undefined && err?.signal === 'SIGTERM') {
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