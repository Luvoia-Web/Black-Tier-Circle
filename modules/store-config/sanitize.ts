const ALLOWED = new Set(['b', 'i', 'u', 'code', 'a']);

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hrefFromTag(raw: string): string | null {
  const match = raw.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const value = match?.[1] ?? match?.[2] ?? match?.[3] ?? '';
  return value.trim();
}

/**
 * Keeps b, i, u, code, and https/t.me anchors. Everything else becomes text.
 * The result is balanced. Input that cannot be made safe is fully escaped.
 */
export function sanitizeBotHtml(input: string): string {
  try {
    return sanitizeBalanced(input);
  } catch {
    return escapeHtml(input.replace(/<[^>]*>/g, ''));
  }
}

function sanitizeBalanced(input: string): string {
  const stack: string[] = [];
  let out = '';
  let index = 0;
  while (index < input.length) {
    const open = input.indexOf('<', index);
    if (open === -1) {
      out += escapeHtml(input.slice(index));
      break;
    }
    out += escapeHtml(input.slice(index, open));
    const close = input.indexOf('>', open + 1);
    if (close === -1) {
      out += escapeHtml(input.slice(open));
      break;
    }
    const raw = input.slice(open + 1, close).trim();
    index = close + 1;
    if (raw.length === 0 || raw.startsWith('!') || raw.startsWith('?')) {
      continue;
    }
    const closing = raw.startsWith('/');
    const body = closing ? raw.slice(1).trim() : raw.replace(/\/$/, '').trim();
    const name = (body.split(/\s/)[0] ?? '').toLowerCase();
    if (!ALLOWED.has(name)) {
      continue;
    }
    if (closing) {
      if (stack[stack.length - 1] === name) {
        stack.pop();
        out += `</${name}>`;
      }
      continue;
    }
    if (name === 'a') {
      const href = hrefFromTag(raw);
      if (href === null || !isSafeHref(href)) {
        continue;
      }
      stack.push('a');
      out += `<a href="${escapeHtml(href)}">`;
      continue;
    }
    stack.push(name);
    out += `<${name}>`;
  }
  while (stack.length > 0) {
    const name = stack.pop();
    if (name) {
      out += `</${name}>`;
    }
  }
  if (!tagsBalanced(out)) {
    return escapeHtml(input.replace(/<[^>]*>/g, ''));
  }
  return out;
}

function isSafeHref(href: string): boolean {
  const value = href.trim();
  const lower = value.toLowerCase().replace(/\s/g, '');
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
    return false;
  }
  return /^(https:\/\/|(https?:\/\/)?(t\.me|telegram\.me)\/)/i.test(value);
}

function tagsBalanced(html: string): boolean {
  const stack: string[] = [];
  const pattern = /<\/?([a-z0-9]+)(?:\s[^>]*)?>/gi;
  let match = pattern.exec(html);
  while (match) {
    const full = match[0];
    const name = (match[1] ?? '').toLowerCase();
    if (full.startsWith('</')) {
      if (stack.pop() !== name) {
        return false;
      }
    } else if (!full.endsWith('/>')) {
      stack.push(name);
    }
    match = pattern.exec(html);
  }
  return stack.length === 0;
}
