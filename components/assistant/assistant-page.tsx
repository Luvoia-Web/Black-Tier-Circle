/**
 * @file components/assistant/assistant-page.tsx
 *
 * Full-page assistant with a session history sidebar.
 *
 * @module Components
 */

'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { AssistantChat, type ChatMessage } from '@/components/assistant/assistant-chat';

/**
 * Dashboard page for a longer assistant conversation.
 */
export function AssistantPage(): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  return (
    <div>
      <PageHeader title="AI Assistant" description="Ask anything about Black Tier Circle" />
      <div className="grid min-h-[70vh] gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-sm font-medium text-[var(--text-1)]">This session</p>
          {messages.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--text-3)]">Your questions will show up here.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {messages
                .filter((message) => message.role === 'user')
                .map((message) => (
                  <li key={message.id} className="truncate text-sm text-[var(--text-2)]">
                    {message.content}
                  </li>
                ))}
            </ul>
          )}
        </aside>
        <section className="flex min-h-[70vh] flex-col overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-card)]">
          <AssistantChat messages={messages} onMessages={setMessages} />
        </section>
      </div>
    </div>
  );
}
