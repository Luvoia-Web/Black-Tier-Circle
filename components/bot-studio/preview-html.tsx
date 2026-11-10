import { Fragment, type ReactNode } from 'react';
import { sanitizeBotHtml } from '@/modules/store-config/sanitize';

/**
 * Renders already-sanitized bot HTML as React elements.
 * Raw owner input is sanitized before it reaches this parser.
 */
export function PreviewHtml({ html }: { readonly html: string }): JSX.Element {
  return <div className="whitespace-pre-wrap">{parseSanitized(sanitizeBotHtml(html))}</div>;
}

function parseSanitized(html: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let index = 0;
  let key = 0;
  while (index < html.length) {
    const open = html.indexOf('<', index);
    if (open === -1) {
      nodes.push(html.slice(index));
      break;
    }
    if (open > index) {
      nodes.push(html.slice(index, open));
    }
    const close = html.indexOf('>', open);
    if (close === -1) {
      nodes.push(html.slice(open));
      break;
    }
    const raw = html.slice(open + 1, close);
    index = close + 1;
    if (raw.startsWith('/')) {
      continue;
    }
    const name = raw.split(/\s/)[0]?.toLowerCase() ?? '';
    const end = findClose(html, index, name);
    const inner = end === -1 ? '' : html.slice(index, end);
    const children = parseSanitized(inner);
    const nextKey = key;
    key += 1;
    if (name === 'b') {
      nodes.push(<strong key={nextKey}>{children}</strong>);
    } else if (name === 'i') {
      nodes.push(<em key={nextKey}>{children}</em>);
    } else if (name === 'u') {
      nodes.push(<u key={nextKey}>{children}</u>);
    } else if (name === 'code') {
      nodes.push(<code key={nextKey}>{children}</code>);
    } else if (name === 'a') {
      const href = raw.match(/href="([^"]*)"/)?.[1] ?? '#';
      nodes.push(
        <a key={nextKey} href={href} target="_blank" rel="noreferrer">
          {children}
        </a>,
      );
    } else {
      nodes.push(<Fragment key={nextKey}>{children}</Fragment>);
    }
    index = end === -1 ? html.length : end + `</${name}>`.length;
  }
  return nodes;
}

function findClose(html: string, from: number, name: string): number {
  const token = `</${name}>`;
  return html.indexOf(token, from);
}
