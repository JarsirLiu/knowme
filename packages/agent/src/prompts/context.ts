export function buildEnvironmentContext(cwd: string): string {
  return `<environment_context>
  <cwd>${escapeXml(cwd)}</cwd>
</environment_context>`
}

export function buildTimeReminder(): string {
  const now = new Date()
  const iso = now.toISOString().replace('T', ' ').slice(0, 19)
  return `It is ${iso} UTC.`
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}