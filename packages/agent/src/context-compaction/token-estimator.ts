export function estimateChatTokens(value: unknown): number {
  const text = typeof value === 'string' ? value : stringify(value)
  let tokens = 0
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0
    if (code <= 0x7f) tokens += /[\s]/u.test(character) ? 0.25 : 0.34
    else if (code >= 0x2e80 && code <= 0x9fff) tokens += 0.75
    else if (code >= 0xf900 && code <= 0xfaff) tokens += 0.75
    else if (code >= 0x20000 && code <= 0x3134f) tokens += 0.75
    else tokens += 0.75
  }
  return Math.max(1, Math.ceil(tokens))
}

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return String(value)
  }
}
