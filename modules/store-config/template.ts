import { escapeHtml, sanitizeBotHtml } from '@/modules/store-config/sanitize';

/**
 * Escapes placeholder values, then keeps only the safe HTML in the template.
 * Unknown placeholders stay as written.
 */
export function renderTemplate(template: string, vars: Readonly<Record<string, string>>): string {
  const safe = sanitizeBotHtml(template);
  return safe.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) {
      return match;
    }
    return escapeHtml(vars[key] ?? '');
  });
}
