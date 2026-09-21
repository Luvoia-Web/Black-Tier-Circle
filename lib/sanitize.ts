/**
 * @file lib/sanitize.ts
 * Input sanitization for user-supplied content.
 * Used before storing or sending user input anywhere.
 */

/** Escapes Telegram MarkdownV2 special characters */
export function escapeTelegramMarkdown(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/** Strips HTML tags from user input */
export function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

/** Sanitizes user input: strips HTML + trims */
export function sanitizeInput(text: string): string {
  return stripHtml(text).trim();
}

/**
 * Sanitizes text for safe use in Telegram MarkdownV2 messages.
 * Strips HTML and escapes all MarkdownV2 special characters.
 * Truncates to maxLength to prevent oversized messages.
 */
export function sanitizeForTelegram(text: string, maxLength: number = 3000): string {
  const stripped = stripHtml(text).trim();
  const truncated = stripped.slice(0, maxLength);
  return truncated.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}
