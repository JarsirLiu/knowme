import { execFile } from 'node:child_process'
import { tool } from '@openai/agents'
import { z } from 'zod'

export const gitDiff = (workspace: string) =>
  tool({
    name: 'git_diff',
    description: 'Read the current tracked changes, including staged and unstaged changes. Use paths to narrow the review. This never changes the repository.',
    parameters: z.object({
      paths: z.array(z.string()).nullable().optional().describe('Optional relative file paths to review'),
    }),
    execute: async ({ paths }) =>
      new Promise<string>((resolve) => {
        const args = ['diff', '--no-ext-diff', '--unified=80', 'HEAD']
        if (paths?.length) args.push('--', ...paths)

        execFile(
          'git',
          args,
          { cwd: workspace, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
          (error, stdout, stderr) => {
            if (error) {
              resolve(`git_diff failed: ${stderr || error.message}`)
              return
            }
            resolve(stdout.trim() || '(no tracked changes)')
          },
        )
      }),
  })
