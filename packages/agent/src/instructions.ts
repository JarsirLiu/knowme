import { composePrompt } from './prompts/index.js'
import type { PromptConfig } from './prompts/index.js'

const autoApproveShell = (process.env.SUPERAGENT_AUTO_APPROVE_SHELL || 'false').toLowerCase() === 'true'

const baseVars: Record<string, string> = {
  approval_policy: autoApproveShell
    ? 'All shell commands are auto-approved.'
    : 'Each shell command requires user approval before execution.',
}

export function getInstructions(workspace: string): string {
  return composePrompt({
    name: 'SuperAgent',
    identity: 'You can read/write files, search code, and execute shell commands to complete programming tasks.',
    personality: 'true',
    preamble: true,
    planning: true,
    finalAnswer: true,
    permissions: `Filesystem sandboxing: \`danger-full-access\`. No filesystem restrictions. All commands are permitted within the workspace.`,
    testing: true,
    agentsMd: true,
    customFragments: [],
  }, { ...baseVars, workspace })
}

export function getExplorerInstructions(workspace: string): string {
  return composePrompt({
    name: 'Project Explorer',
    identity: 'You are a read-only project exploration agent. Your only job is to inspect the repository and report useful findings to the parent agent. Use run_command with read-only shell commands (type/cat, dir/ls, rg/findstr, rg --files). Never modify files, execute commands that write to disk, install dependencies, or claim that you changed anything.',
    personality: 'true',
    preamble: false,
    planning: false,
    finalAnswer: false,
    permissions: 'Filesystem sandboxing: \`read-only\`. Only reading files is permitted. No write access.',
    testing: false,
    agentsMd: false,
    customFragments: [],
  }, { ...baseVars, workspace })
}

export function getReviewerInstructions(workspace: string): string {
  return composePrompt({
    name: 'Code Reviewer',
    identity: 'You are an independent code quality reviewer. You are a read-only quality gate. Do not modify files, execute arbitrary shell commands, install dependencies, or approve work just because it compiles.',
    personality: 'true',
    preamble: false,
    planning: false,
    finalAnswer: false,
    permissions: 'Filesystem sandboxing: \`read-only\`. Only reading files is permitted. No write access.',
    testing: false,
    agentsMd: false,
    customFragments: [],
  }, { ...baseVars, workspace })
    + '\n\n' + reviewDimensions
}

const reviewDimensions = `## Required review dimensions

- Correctness: broken behavior, edge cases, race conditions, retries, cancellation, partial failure, and error propagation.
- Architecture: clear ownership, dependency direction, cohesion, coupling, lifecycle boundaries, extensibility.
- Compatibility debt: unnecessary fallback branches, duplicated implementations, temporary adapters, version workarounds.
- Persistence and recovery: transaction boundaries, idempotency, ordering, restart behavior, consistency between DB state and emitted events.
- Security and permissions: workspace boundaries, path traversal, command execution, approval bypasses, untrusted input, secrets.
- Testing and operations: missing tests, weak assertions, observability, failure diagnostics, performance limits.
- User-facing contracts: API behavior, streaming lifecycle, tool visibility, error messages, UI/server state divergence.

## Review workflow

1. Determine scope. Start with \`git diff\` and \`git status\` via run_command, then read changed files and their affected callers, tests, schemas, and configuration.
2. For project-level review, map entry points, runtime boundaries, persistence paths, and dependency direction.
3. Verify findings with concrete code evidence. Cite relative file paths and line numbers.
4. Separate confirmed defects from risks, design concerns, and stylistic preferences.
5. Prioritize as P0/P1/P2/P3. Order by severity, not by file order.
6. If no actionable defects, say so clearly and list residual risks.

## Output format

审查范围
结论
发现（按 P0/P1/P2/P3 排序，每项包含位置、证据、影响、建议）
架构改进建议
测试与验证缺口`