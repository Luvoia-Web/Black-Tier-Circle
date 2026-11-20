/**
 * Telegram HTML subset <-> rich contentEditable conversion matching Bot Studio.
 */

export function telegramHtmlToEditorNodes(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&lt;b&gt;/g, '<strong>')
    .replace(/&lt;\/b&gt;/g, '</strong>')
    .replace(/&lt;i&gt;/g, '<em>')
    .replace(/&lt;\/i&gt;/g, '</em>')
    .replace(/&lt;u&gt;/g, '<u>')
    .replace(/&lt;\/u&gt;/g, '</u>')
    .replace(/&lt;s&gt;/g, '<s>')
    .replace(/&lt;\/s&gt;/g, '</s>')
    .replace(/&lt;code&gt;/g, '<code>')
    .replace(/&lt;\/code&gt;/g, '</code>')
    .replace(/&lt;tg-spoiler&gt;/g, '<span class="opacity-40">')
    .replace(/&lt;\/tg-spoiler&gt;/g, '</span>')
    .replace(/&lt;blockquote&gt;/g, '<blockquote>')
    .replace(/&lt;\/blockquote&gt;/g, '</blockquote>')
    .replace(/\n/g, '<br>');
}

export function editorNodesToTelegramHtml(root: HTMLElement): string {
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (!(node instanceof HTMLElement)) return '';
    const inner = [...node.childNodes].map(walk).join('');
    const tag = node.tagName;
    if (tag === 'STRONG' || tag === 'B') return `<b>${inner}</b>`;
    if (tag === 'EM' || tag === 'I') return `<i>${inner}</i>`;
    if (tag === 'U') return `<u>${inner}</u>`;
    if (tag === 'S' || tag === 'STRIKE') return `<s>${inner}</s>`;
    if (tag === 'CODE') return `<code>${inner}</code>`;
    if (tag === 'BLOCKQUOTE') return `<blockquote>${inner}</blockquote>`;
    if (tag === 'BR') return '\n';
    if (tag === 'DIV' || tag === 'P') return inner ? `\n${inner}` : '\n';
    if (node.dataset.spoiler === '1') return `<tg-spoiler>${inner}</tg-spoiler>`;
    return inner;
  };
  return [...root.childNodes].map(walk).join('').replace(/^\n+/, '');
}
