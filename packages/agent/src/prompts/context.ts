export function detectShell(): string {
  if (process.platform === 'win32') {
    return 'powershell'
  }
  return process.env.SHELL?.split(/[/\\]/).pop() ?? 'sh'
}

export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

export function buildEnvironmentContext(cwd: string): string {
  return `<environment_context>
  <cwd>${escapeXml(cwd)}</cwd>
  <shell>${detectShell()}</shell>
  <current_date>${new Date().toISOString().slice(0, 10)}</current_date>
  <timezone>${detectTimezone()}</timezone>
</environment_context>`
}

export function buildTimeReminder(): string {
  const now = new Date()
  const iso = now.toISOString().replace('T', ' ').slice(0, 19)
  return `It is ${iso} UTC (${now.toLocaleString()}).`
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}