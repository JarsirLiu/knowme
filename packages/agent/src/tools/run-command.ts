import { exec, execFile } from 'node:child_process'
import { tool } from '@openai/agents'
import { z } from 'zod'

type ToolCallDetails = { signal?: AbortSignal }

export const runCommand = (autoApprove: boolean, workspace: string) =>
  tool({
    name: 'run_command',
    description:
      'Execute a shell command in the workspace directory. For running tests, install deps, git operations, etc. Output truncated to 8000 chars.',
    parameters: z.object({
      command: z.string().describe('Command to execute'),
      timeout_sec: z
        .coerce.number().int().min(1).max(600)
        .nullable().optional()
        .describe('Timeout in seconds, default 120'),
    }),
    needsApproval: async () => !autoApprove,
    execute: async ({ command, timeout_sec }, _context, details?: ToolCallDetails) =>
      new Promise<string>((resolve) => {
        let settled = false
        const child = exec(
          command,
          {
            cwd: workspace,
            timeout: (timeout_sec ?? 120) * 1000,
            windowsHide: true,
            maxBuffer: 10 * 1024 * 1024,
            signal: details?.signal,
          },
          (err, stdout, stderr) => {
            if (settled) return
            settled = true
            details?.signal?.removeEventListener('abort', killTree)
            const out = [
              stdout && `stdout:\n${stdout}`,
              stderr && `stderr:\n${stderr}`,
              err && `exit: ${err.code ?? 'killed(timeout)'}`,
            ].filter(Boolean).join('\n')
            resolve((out || '(no output, success)').slice(0, 8000))
          },
        )

        const killTree = () => {
          if (!child.pid) return
          if (process.platform === 'win32') {
            execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => undefined)
          } else {
            child.kill('SIGTERM')
          }
        }
        const timeoutKill = setTimeout(killTree, (timeout_sec ?? 120) * 1000)
        const clearTimeoutKill = () => clearTimeout(timeoutKill)
        child.once('close', clearTimeoutKill)
        details?.signal?.addEventListener('abort', killTree, { once: true })
      }),
  })
