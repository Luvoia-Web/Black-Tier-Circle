/**
 * @file components/assistant/assistant-page.tsx
 *
 * Full-page assistant with a session sidebar and ambient background.
 *
 * @module Components
 */

'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { AssistantChat, type ChatMessage } from '@/components/assistant/assistant-chat';
import { useDashboardIdentity } from '@/components/dashboard-identity';
import { ROUTES } from '@/lib/navigation';

type ChatSession = {
  readonly id: string;
  readonly messages: ChatMessage[];
  readonly startedAt: string;
};

function sessionTitle(session: ChatSession): string {
  const first = session.messages.find((m) => m.role === 'user');
  if (!first) return 'New chat';
  return first.content.length > 40 ? first.content.slice(0, 40) + '…' : first.content;
}

/**
 * Dashboard page for a longer assistant conversation.
 */
export function AssistantPage(): JSX.Element {
  const { displayName, role } = useshboardIdentity();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<string>(() => crypto.randomUUID());
  const [navOpen, setNavOpen] = useState(false);
  const home = role === 'owner' ? ROUTES.owner.home : ROUTES.reseller.home;

  const activeSession = sessions.find((s) => s.id === activeId);
  const messages = activeSession?.messages ?? [];

  const handleMessages = useCallback(
    (next: ChatMessage[]) => {
      setSessions((prev) => {
        const existing = prev.find((s) => s.id === activeId);
        if (existing) {
          return prev.map((s) => s.id === activeId ? { ...s, messages: next } : s);
        }
        return [...prev, { id: activeId, messages: next, startedAt: new Date().toISOString() }];
      });
    },
    [activeId],
  );

  function newChat(): void {
    setActiveId(crypto.randomUUID());
    setNavOpen(false);
  }

  function switchSession(id: string): void {
    setActiveId(id);
    setNavOpen(false);
  }

  const savedSessions = sessions.filter((s) => s.messages.length > 0);

  return (
    <div className="ai-page">
      <div className="ai-page-grid" aria-hidden="true" />
      <span className="ai-page-orb ai-page-orb-a" aria-hidden="true" />
      <span className="ai-page-orb ai-page-orb-b" aria-hidden="true" />
      <span className="ai-page-orb ai-page-orb-c" aria-hidden="true" />
      <button type="button" className="ai-page-menu" aria-expanded={navOpen} onClick={() => setNavOpen((current) => !current)}>
        Chats
      </button>
      <aside className={`ai-side${navOpen ? ' is-open' : ''}`}>
        <p className="ai-side-title">BTC Assistant</p>
        <button type="button" className="ai-new-chat" onClick={newChat}>
          + New Chat
        </button>
        {savedSessions.length === 0 ? (
          <div className="ai-session is-active">
            <p>Current Session</p>
            <ul><li>No messages yet</li></ul>
          </div>
        ) : (
          savedSessions.map((session) => (
            <button
              key={session.id}
              type="button"
              className={`ai-session-btn${session.id === activeId ? ' is-active' : ''}`}
              onClick={() => switchSession(session.id)}
            >
              {sessionTitle(session)}
            </button>
          ))
        )}
        <div className="ai-side-user">
          <span className="ai-side-avatar" aria-hidden="true">{displayName.slice(0, 1).toUpperCase()}</span>
          <div>
            <p>{displayName}</p>
            <p className="ai-side-role">{role === 'owner' ? 'Owner' : 'Reseller'}</p>
          </div>
        </div>
        <Link href={home} className="ai-side-back">Back to dashboard</Link>
      </aside>
      <section className="ai-stage">
        <AssistantChat key={activeId} messages={messages} onMessages={handleMessages} displayName={displayName} />
      </section>
    </div>
  );
}
