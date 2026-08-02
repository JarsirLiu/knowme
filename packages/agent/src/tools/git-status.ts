import { execFile } from 'node:child_process'
import { tool } from '@openai/agents'
import { z } from 'zod'

export const gitStatus = (workspace: string) =>
  tool({
    name: 'git_status',
    description: 'Read the current Git status to identify changed, staged, deleted, and untracked files. This never changes the repository.',
    parameters: z.object({}),
    execute: async () =>
      new Promise<string>((resolve) => {
        execFile(
          'git',
          ['status', '--short'],
          { cwd: workspace, windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
          (error, stdout, stderr) => {
            if (error) {
              resolve(`git_status failed: ${stderr || error.message}`)
              return
            }
            resolve(stdout.trim() || '(clean working tree)')
          },
        )
      }),
  })
