import { exec } from 'node:child_process'
import { tool } from '@openai/agents'
import { z } from 'zod'

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
    execute: async ({ command, timeout_sec }) =>
      new Promise<string>((resolve) => {
        exec(
          command,
          { cwd: workspace, timeout: (timeout_sec ?? 120) * 1000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
          (err, stdout, stderr) => {
            const out = [
              stdout && `stdout:\n${stdout}`,
              stderr && `stderr:\n${stderr}`,
              err && `exit: ${err.code ?? 'killed(timeout)'}`,
            ].filter(Boolean).join('\n')
            resolve((out || '(no output, success)').slice(0, 8000))
          },
        )
      }),
  })