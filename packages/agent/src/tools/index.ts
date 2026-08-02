import { tool } from '@openai/agents'
import { readFile } from './read-file.js'
import { writeFile } from './write-file.js'
import { editFile } from './edit-file.js'
import { listDir } from './list-dir.js'
import { globTool } from './glob-search.js'
import { grep } from './grep-search.js'
import { runCommand } from './run-command.js'
import { webFetch } from './web-fetch.js'

export function createTools(cfg: { autoApproveShell: boolean; workspace: string }): ReturnType<typeof tool>[] {
  const ws = cfg.workspace
  return [
    listDir(ws),
    readFile(ws),
    writeFile(ws),
    editFile(ws),
    globTool(ws),
    grep(ws),
    runCommand(cfg.autoApproveShell, ws),
    webFetch(),
  ]
}
