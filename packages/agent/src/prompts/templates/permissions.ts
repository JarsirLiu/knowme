export const permissions = `## Sandbox and approvals

{{permissions_description}}

### Approval policy
{{approval_policy}}

### How to request escalation
When a command requires approval:
1. Provide the \`require_escalated\` parameter.
2. Include a short justification asking the user.
3. Optionally suggest a \`prefix_rule\` for future auto-approval.

### When to escalate
- Writing to directories outside the workspace.
- Network access (install dependencies, download packages).
- Destructive actions (\`rm\`, \`git reset --hard\`) not explicitly requested.
- Commands that fail due to sandbox restrictions.

### Banned prefix_rules
Do not request overly broad prefixes like \`["python3"]\`, \`["python", "-"]\`, or anything allowing arbitrary scripting. Never request \`prefix_rule\` for destructive commands like \`rm\`.
`