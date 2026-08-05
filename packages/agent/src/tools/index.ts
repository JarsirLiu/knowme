import { shellTool, applyPatchTool } from '@openai/agents'
import type { Tool } from '@openai/agents'
import { LocalShell } from './local-shell.js'
import { LocalEditor } from './local-editor.js'
import { webFetch } from './web-fetch.js'

export function createTools(cfg: { autoApproveShell: boolean; workspace: string }): Tool[] {
  const shell = new LocalShell(cfg.workspace)
  const editor = new LocalEditor(cfg.workspace)
  return [
    shellTool({
      name: 'run_command',
      shell,
      needsApproval: async (_runContext, _action) => !cfg.autoApproveShell,
    }),
    applyPatchTool({
      name: 'edit_file',
      editor,
    }),
    webFetch(),
  ]
}

export function createReadOnlyTools(workspace: string): Tool[] {
  const shell = new LocalShell(workspace)
  return [
    shellTool({
      name: 'run_command',
      shell,
      needsApproval: async () => false,
    }),
  ]
}

export function createReviewTools(workspace: string): Tool[] {
  return createReadOnlyTools(workspace)
}