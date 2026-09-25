/**
 * @file components/assistant/assistant-chat.tsx
 *
 * Shared chat surface for the floating panel and the full assistant page.
 *
 * @module Components
 */

'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import { AIChatMessage } from '@/components/ai/AIChatMessage';
import { AITypingIndicator } from '@/components/ai/AITypingIndicator';
import { AIWelcomeScreen } from '@/components/ai/AIWelcomeScreen';

export type ChatMessage = {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly at: string;
};

type AssistantChatProps = {
  readonly messages: ChatMessage[];
  readonly onMessages: (next: ChatMessage[]) => void;
  readonly compact?: boolean;
  readonly displayName?: string;
  readonly onLoadingChange?: (loading: boolean) => void;
};

async function readAssistantStream(response: Response, onDelta: (text: string) => void): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    return;
  }
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) {
        continue;
      }
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') {
        continue;
      }
      try {
        const event = JSON.parse(payload) as { type?: string; delta?: { type?: string; text?: string } };
        if (event.type === 'content_block_delta' && event.delta?.text) {
          onDelta(event.delta.text);
        }
      } catch {
        // Ignore keep-alive lines.
      }
    }
  }
}

/**
 * Message list, suggestions, and composer.
 */
const QUICK = ['How do I add products?', "What's my wallet balance?", 'Bot not responding?'];

export function AssistantChat({
  messages,
  onMessages,
  compact = false,
  displayName,
  onLoadingChange,
}: AssistantChatProps): JSX.Element {
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages, loading]);

  async function send(text: string): Promise<void> {
    const content = text.trim();
    if (!content || loading) {
      return;
    }
    const now = new Date().toISOString();
    const next: ChatMessage[] = [...messages, { id: crypto.randomUUID(), role: 'user', content, at: now }];
    onMessages(next);
    setDraft('');
    setLoading(true);
    onLoadingChange?.(true);
    setError(null);
    const assistantId = crypto.randomUUID();
    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.map((message) => ({ role: message.role, content: message.content })),
        }),
      });
      if (!response.ok || !response.body) {
        const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(json?.error?.message ?? 'The assistant is unavailable right now.');
        setLoading(false);
        onLoadingChange?.(false);
        return;
      }
      let assembled = '';
      onMessages([
        ...next,
        { id: assistantId, role: 'assistant', content: '', at: new Date().toISOString() },
      ]);
      await readAssistantStream(response, (delta) => {
        assembled += delta;
        onMessages([
          ...next,
          { id: assistantId, role: 'assistant', content: assembled, at: new Date().toISOString() },
        ]);
      });
    } catch {
      setError('The assistant is unavailable right now.');
    } finally {
      setLoading(false);
      onLoadingChange?.(false);
    }
  }

  function onSubmit(event: FormEvent): void {
    event.preventDefault();
    void send(draft);
  }

  function resize(field: HTMLTextAreaElement): void {
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, compact ? 120 : 160)}px`;
  }

  const ready = draft.trim().length > 0;
  const inputId = compact ? 'assistant-input' : 'assistant-page-input';

  return (
    <div className={`ai-chat${compact ? ' is-compact' : ' is-page'}`}>
      <div ref={scroller} className="ai-thread" aria-live="polite">
        {messages.length === 0 ? (
          <AIWelcomeScreen
            variant={compact ? 'panel' : 'page'}
            {...(displayName ? { displayName } : {})}
            onPick={setDraft}
          />
        ) : null}
        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const next = messages[index + 1];
          const edge = previous?.role !== message.role || next?.role !== message.role;
          return <AIChatMessage key={message.id} message={message} showTime={edge} showOrb={!compact && message.role === 'assistant' && previous?.role !== 'assistant'} />;
        })}
        {loading && messages[messages.length - 1]?.role === 'user' ? <AITypingIndicator /> : null}
        {error ? (
          <p className="ai-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <form onSubmit={onSubmit} className="ai-composer">
        {!compact && messages.length === 0 ? (
          <div className="ai-quick">
            {QUICK.map((item) => (
              <button key={item} type="button" className="ai-quick-pill" onClick={() => setDraft(item)}>
                {item}
              </button>
            ))}
          </div>
        ) : null}
        <div className="ai-input-shell">
          <label className="sr-only" htmlFor={inputId}>
            Message
          </label>
          <textarea
            id={inputId}
            rows={compact ? 1 : 2}
            value={draft}
            maxLength={4000}
            placeholder="Ask me anything..."
            className="ai-input"
            onChange={(event) => {
              setDraft(event.target.value);
              resize(event.target);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send(draft);
              }
            }}
          />
          <button type="button" className="ai-clear" aria-label="Clear chat" onClick={() => onMessages([])}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
          <button type="submit" className={`ai-send${ready ? ' is-ready' : ''}`} disabled={loading || !ready} aria-label="Send">
            {loading ? <span className="ai-spinner" /> : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 13V3M8 3 4 7M8 3l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
        <p className="ai-footnote">BTC Assistant · Powered by Claude · Responses may be inaccurate</p>
      </form>
    </div>
  );
}
