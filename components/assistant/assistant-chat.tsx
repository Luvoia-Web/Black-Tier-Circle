/**
 * @file components/assistant/assistant-chat.tsx
 *
 * Shared chat surface for the floating panel and the full assistant page.
 *
 * @module Components
 */

'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';

export type ChatMessage = {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly at: string;
};

const SUGGESTIONS = [
  'How do I connect my bot?',
  'How does wallet top-up work?',
  'How do resellers set prices?',
  'How does product delivery work?',
];

type AssistantChatProps = {
  readonly messages: ChatMessage[];
  readonly onMessages: (next: ChatMessage[]) => void;
  readonly compact?: boolean;
};

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

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
export function AssistantChat({ messages, onMessages, compact = false }: AssistantChatProps): JSX.Element {
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
    }
  }

  function onSubmit(event: FormEvent): void {
    event.preventDefault();
    void send(draft);
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${compact ? '' : 'h-full'}`}>
      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center px-2 py-6 text-center">
            <span className="login-orb login-orb-3 assistant-mini-orb" aria-hidden="true" />
            <p className="text-base font-medium text-[var(--text-1)]">Hi! I&apos;m your Black Tier Circle assistant.</p>
            <p className="mt-1 text-sm text-[var(--text-2)]">Ask me anything about the platform.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="min-h-11 rounded-full border border-[var(--border)] px-3 text-left text-sm text-[var(--text-1)] hover:bg-[var(--bg-hover)]"
                  onClick={() => setDraft(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((message) => (
          <div key={message.id} className={message.role === 'user' ? 'ml-8 text-right' : 'mr-8 text-left'}>
            <p
              className={
                message.role === 'user'
                  ? 'inline-block rounded-[18px_18px_4px_18px] bg-[var(--accent)] px-3 py-2 text-left text-sm text-white'
                  : 'inline-block rounded-[18px_18px_18px_4px] bg-[var(--bg-raised)] px-3 py-2 text-left text-sm text-[var(--text-1)]'
              }
            >
              {message.content || '…'}
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-3)]">{timeLabel(message.at)}</p>
          </div>
        ))}
        {loading && messages[messages.length - 1]?.role === 'user' ? (
          <p className="text-sm text-[var(--text-3)]" aria-label="Assistant is typing">
            <span className="assistant-dot" />
            <span className="assistant-dot" />
            <span className="assistant-dot" />
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-[var(--red)]" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <form onSubmit={onSubmit} className="border-t border-[var(--border)] p-3">
        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor="assistant-input">
            Message
          </label>
          <textarea
            id="assistant-input"
            rows={1}
            value={draft}
            maxLength={4000}
            placeholder="Ask about Black Tier Circle"
            className="max-h-28 min-h-11 flex-1 resize-none rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-page)] px-3 py-2 text-sm text-[var(--text-1)]"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send(draft);
              }
            }}
          />
          <button
            type="submit"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent)] text-white disabled:opacity-50"
            disabled={loading || draft.trim().length === 0}
            aria-label="Send"
          >
            <Send size={16} aria-hidden="true" />
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-[var(--text-3)]">Black Tier Circle AI · Powered by Claude</p>
      </form>
    </div>
  );
}
