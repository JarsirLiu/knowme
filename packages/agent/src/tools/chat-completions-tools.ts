import { tool } from '@openai/agents'
import type { ApplyPatchOperation, ShellAction, Tool } from '@openai/agents'
import { z } from 'zod'
import { LocalEditor } from './local-editor.js'
import { LocalShell } from './local-shell.js'

const numericInput = z.union([z.number(), z.string()]).nullable().optional()

const shellParameters = z.object({
  commands: z.array(z.string()).min(1).describe('Commands to execute in order'),
  timeoutMs: numericInput.describe('Command timeout in milliseconds'),
  maxOutputLength: numericInput.describe('Maximum output characters per stream'),
})

const patchParameters = z.object({
  type: z.enum(['create_file', 'update_file', 'delete_file']),
  path: z.string().min(1),
  diff: z.string().optional(),
  moveTo: z.string().min(1).nullable().optional(),
})

type ToolCallDetailsLike = { signal?: AbortSignal }

function normalizeNumber(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function asToolOutput(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

export function chatCompletionsShellTool(workspace: string): Tool {
  const shell = new LocalShell(workspace)
  return tool({
    name: 'run_command',
    description:
      'Execute one or more shell commands in the current workspace. Commands run in order and return stdout, stderr, exit codes, or timeout results.',
    parameters: shellParameters,
    execute: async ({ commands, timeoutMs, maxOutputLength }, _context, details?: ToolCallDetailsLike) => {
      const action: ShellAction = {
        commands,
        timeoutMs: normalizeNumber(timeoutMs),
        maxOutputLength: normalizeNumber(maxOutputLength),
      }
      return asToolOutput(await shell.run(action, details?.signal))
    },
  })
}

export function chatCompletionsPatchTool(workspace: string): Tool {
  const editor = new LocalEditor(workspace)
  return tool({
    name: 'edit_file',
    description:
      'Create, update, or delete a file in the current workspace. For create_file: set diff to the full file content. For update_file: diff is a V4A patch with `@@` then `-old line` + `+new line` for each changed line. For delete_file: only type and path are needed.',
    parameters: patchParameters,
    execute: async (input) => {
      const operation = patchParameters.parse(input)
      if (operation.type !== 'delete_file' && operation.diff === undefined) {
        return 'Patch failed: diff is required for create_file and update_file operations.'
      }
      const typedOperation = operation as ApplyPatchOperation
      let result
      switch (typedOperation.type) {
        case 'create_file':
          result = await editor.createFile(typedOperation)
          break
        case 'update_file':
          result = await editor.updateFile(typedOperation)
          break
        case 'delete_file':
          result = await editor.deleteFile(typedOperation)
          break
      }
      return asToolOutput(result ?? { status: 'completed' })
    },
  })
}
