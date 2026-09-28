/**
 * @file components/ai/AIChatMessage.tsx
 *
 * One chat bubble with a light markdown treatment for assistant replies.
 *
 * @module Components
 */

'use client';

import { useState, type ReactNode } from 'react';
import { AIOrb } from '@/components/ai/AIOrb';
import type { ChatMessage } from '@/components/assistant/assistant-chat';

type AIChatMessageProps = {
  readonly message: ChatMessage;
  readonly showTime?: boolean;
  readonly showOrb?: boolean;
};

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

function renderBody(content: string): ReactNode {
  const lines = content.split('\n');
  return lines.map((line, index) => {
    const item = /^[-*]\s+(.+)/.exec(line);
    if (item?.[1]) {
      return (
        <span key={index} className="ai-md-item">
          {renderInline(item[1])}
        </span>
      );
    }
    return (
      <span key={index}>
        {renderInline(line)}
        {index < lines.length - 1 ? <br /> : null}
      </span>
    );
  });
}

/**
 * User bubbles enter from the right. Assistant bubbles enter from the left.
 */
export function AIChatMessage({ message, showTime = true, showOrb = false }: AIChatMessageProps): JSX.Element {
  const [memoryOpen, setMemoryOpen] = useState(false);
  const time = new Date(message.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const mine = message.role === 'user';
  return (
    <div className={`ai-msg${mine ? ' is-user' : ' is-ai'}`}>
      {!mine && showOrb ? <AIOrb size={32} /> : null}
      <div>
        <p className="ai-bubble">{message.content ? renderBody(message.content) : '…'}</p>
        {showTime || message.memoryPowered ? (
          <p className="ai-time">
            {showTime ? time : null}
            {message.memoryPowered ? (
              <button
                type="button"
                className="ml-2 text-[var(--accent-soft)]"
                onClick={() => setMemoryOpen((open) => !open)}
              >
                ✦ Memory
              </button>
            ) : null}
          </p>
        ) : null}
        {memoryOpen && message.memories && message.memories.length > 0 ? (
          <div className="mt-1 max-w-sm rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-card)] p-2 text-xs text-[var(--text-2)]">
            {message.memories.map((item) => (
              <p key={item.text} className="py-1">
                {item.text}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
