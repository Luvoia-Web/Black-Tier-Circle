/**
 * @file components/assistant/assistant-page.tsx
 * Full-page Remy AI inside the platform shell (no nested inner sidebar).
 * Persistent per-role chat history lives behind a compact History popover.
 * @module Components
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { History, Plus, Trash2 } from 'lucide-react';
import { AssistantChat, type ChatMessage } from '@/components/assistant/assistant-chat';
import { Button } from '@/components/platform/ui';
import type { UserRole } from '@/modules/identity/types';

type ChatSession = {
  readonly id: string;
  readonly messages: ChatMessage[];
  readonly startedAt: string;
};

const MAX_SESSIONS = 10;

function storageKeyForRole(role: 'owner' | 'reseller'): string {
  return `btc-remy-sessions-${role}`;
}

function loadSessions(key: string): ChatSession[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ChatSession[]) : [];
  } catch {
    return [];
  }
}

function saveSessions(key: string, sessions: ChatSession[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(sessions.slice(-MAX_SESSIONS)));
  } catch {
    // Ignore storage quota failures.
  }
}

function sessionTitle(session: ChatSession): string {
  const first = session.messages.find((m) => m.role === 'user');
  if (!first) return 'New chat';
  return first.content.length > 42 ? `${first.content.slice(0, 42)}…` : first.content;
}

type AssistantPageProps = {
  readonly displayName?: string;
  readonly role?: UserRole;
};

export function AssistantPage({ displayName = 'You', role = 'owner' }: AssistantPageProps): JSX.Element {
  const chatRole = role === 'reseller' ? 'reseller' : 'owner';
  const storageKey = storageKeyForRole(chatRole);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = loadSessions(storageKey);
    const newId = crypto.randomUUID();
    setSessions(saved);
    setActiveId(newId);
  }, [storageKey]);

  useEffect(() => {
    if (!historyOpen) return;
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') setHistoryOpen(false);
    }
    function onPointer(event: MouseEvent): void {
      if (historyRef.current && !historyRef.current.contains(event.target as Node)) {
        setHistoryOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [historyOpen]);

  const activeSession = sessions.find((s) => s.id === activeId);
  const messages = activeSession?.messages ?? [];

  const handleMessages = useCallback(
    (next: ChatMessage[]) => {
      setSessions((prev) => {
        const existing = prev.find((s) => s.id === activeId);
        let updated: ChatSession[];
        if (existing) {
          updated = next.length === 0
            ? prev.filter((s) => s.id !== activeId)
            : prev.map((s) => (s.id === activeId ? { ...s, messages: next } : s));
        } else if (next.length > 0) {
          updated = [...prev, { id: activeId, messages: next, startedAt: new Date().toISOString() }];
        } else {
          updated = prev;
        }
        saveSessions(storageKey, updated);
        return updated;
      });
    },
    [activeId, storageKey],
  );

  function newChat(): void {
    setActiveId(crypto.randomUUID());
    setHistoryOpen(false);
  }

  function switchSession(id: string): void {
    setActiveId(id);
    setHistoryOpen(false);
  }

  function removeSession(id: string): void {
    setSessions((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      saveSessions(storageKey, updated);
      return updated;
    });
    if (id === activeId) {
      setActiveId(crypto.randomUUID());
    }
  }

  const savedSessions = sessions.filter((s) => s.messages.length > 0).slice().reverse();

  return (
    <section className="flex min-h-[calc(100vh-120px)] flex-col gap-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-medium tracking-tight text-ink">Remy AI</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {chatRole === 'owner'
              ? 'Ask about store revenue, orders, suppliers, bots, or buyer patterns.'
              : 'Ask about your store, products, pricing, wallet, bots, or buyer patterns.'}
          </p>
        </div>

        <div className="relative flex flex-wrap items-center gap-2" ref={historyRef}>
          {savedSessions.length > 0 ? (
            <Button
              variant="secondary"
              aria-expanded={historyOpen}
              onClick={() => setHistoryOpen((open) => !open)}
            >
              <History className="h-3.5 w-3.5" aria-hidden="true" />
              History ({savedSessions.length})
            </Button>
          ) : null}
          <Button variant="secondary" onClick={newChat}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            New chat
          </Button>

          {historyOpen && savedSessions.length > 0 ? (
            <div
              role="region"
              aria-label="Recent chats"
              className="absolute right-0 top-full z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-stroke bg-raised p-2 shadow-2xl"
            >
              <p className="px-2 py-1 text-[11px] font-medium text-ink-faint">Recent chats</p>
              <ul className="mt-1 max-h-64 space-y-1 overflow-y-auto">
                {savedSessions.map((session) => (
                  <li key={session.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      className={`min-w-0 flex-1 truncate rounded-lg px-2.5 py-2 text-left text-xs transition ${
                        session.id === activeId
                          ? 'bg-rose/20 text-ink'
                          : 'text-ink-soft hover:bg-white/[0.06] hover:text-ink'
                      }`}
                      onClick={() => switchSession(session.id)}
                    >
                      {sessionTitle(session)}
                    </button>
                    <button
                      type="button"
                      aria-label="Remove chat"
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-faint hover:bg-white/[0.06] hover:text-ink"
                      onClick={() => removeSession(session.id)}
                    >
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </header>

      <div className="glass-card relative flex min-h-[540px] flex-1 flex-col overflow-hidden rounded-xl border border-stroke">
        <div className="ai-page-grid" aria-hidden="true" />
        <span className="ai-page-orb ai-page-orb-a" aria-hidden="true" />
        <span className="ai-page-orb ai-page-orb-b" aria-hidden="true" />
        <span className="ai-page-orb ai-page-orb-c" aria-hidden="true" />
        <AssistantChat
          key={activeId}
          messages={messages}
          onMessages={handleMessages}
          displayName={displayName}
          role={chatRole}
        />
      </div>
    </section>
  );
}
