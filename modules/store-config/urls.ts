const BLOCKED_SCHEME = /^(javascript|data|vbscript|file):/i;

/**
 * Allows https URLs and t.me / telegram.me links. Rejects every other scheme.
 */
export function isAllowedBotUrl(value: string): boolean {
  const url = value.trim();
  if (url.length === 0 || url.length > 300) {
    return false;
  }
  if (BLOCKED_SCHEME.test(url) || /[\s<>"']/.test(url)) {
    return false;
  }
  if (/^(https?:\/\/)?(t\.me|telegram\.me)\//i.test(url)) {
    return true;
  }
  if (!url.toLowerCase().startsWith('https://')) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

export function normalizeBotUrl(value: string): string {
  const url = value.trim();
  if (/^(t\.me|telegram\.me)\//i.test(url)) {
    return `https://${url}`;
  }
  return url;
}
