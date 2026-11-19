import { escapeHtml, sanitizeBotHtml } from '@/modules/store-config/sanitize';

/**
 * Escapes placeholder values, strips standalone empty-placeholder lines,
 * and keeps only the safe HTML in the template.
 * Unknown placeholders stay as written.
 */
export function renderTemplate(template: string, vars: Readonly<Record<string, string>>): string {
  const safe = sanitizeBotHtml(template);
  const filteredLines = safe
    .split('\n')
    .filter((line) => {
      const onlyPlaceholder = line.trim().match(/^\{([a-zA-Z0-9_]+)\}$/);
      if (!onlyPlaceholder?.[1]) return true;
      const key = onlyPlaceholder[1];
      if (!Object.prototype.hasOwnProperty.call(vars, key)) return true;
      return (vars[key] ?? '').trim().length > 0;
    })
    .join('\n');
  const replaced = filteredLines.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) {
      return match;
    }
    return escapeHtml(vars[key] ?? '');
  });
  return replaced.replace(/\n{3,}/g, '\n\n').trimEnd();
}
