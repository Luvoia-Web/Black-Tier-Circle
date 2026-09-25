/**
 * @file components/assistant/assistant-page.tsx
 *
 * Full-page assistant with a session sidebar and ambient background.
 *
 * @module Components
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AssistantChat, type ChatMessage } from '@/components/assistant/assistant-chat';
import { useDashboardIdentity } from '@/components/dashboard-identity';
import { ROUTES } from '@/lib/navigation';

/**
 * Dashboard page for a longer assistant conversation.
 */
export function AssistantPage(): JSX.Element {
  const { displayName, role } = useDashboardIdentity();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [navOpen, setNavOpen] = useState(false);
  const home = role === 'owner' ? ROUTES.owner.home : ROUTES.reseller.home;
  const prompts = messages.filter((message) => message.role === 'user');

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
        <button type="button" className="ai-new-chat" onClick={() => setMessages([])}>
          + New Chat
        </button>
        <div className={`ai-session${prompts.length >= 0 ? ' is-active' : ''}`}>
          <p>Current Session</p>
          <ul>
            {prompts.length === 0 ? <li>No messages yet</li> : prompts.map((message) => <li key={message.id}>{message.content}</li>)}
          </ul>
        </div>
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
        <AssistantChat messages={messages} onMessages={setMessages} displayName={displayName} />
      </section>
    </div>
  );
}
