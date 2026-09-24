/**
 * @file components/assistant/assistant-widget.tsx
 *
 * Floating assistant button and slide-in panel for every dashboard page.
 *
 * @module Components
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Maximize2, MessageSquare, X } from 'lucide-react';
import { AssistantChat, type ChatMessage } from '@/components/assistant/assistant-chat';
import { ROUTES } from '@/lib/navigation';
import type { UserRole } from '@/modules/identity/types';

const SEEN_KEY = 'btc-assistant-seen';

type AssistantWidgetProps = {
  readonly role: UserRole;
};

/**
 * Bottom-right launcher. First visit pulses until the panel is opened.
 */
export function AssistantWidget({ role }: AssistantWidgetProps): JSX.Element {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    setPulse(window.sessionStorage.getItem(SEEN_KEY) !== '1');
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointer(event: MouseEvent): void {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        const target = event.target as HTMLElement | null;
        if (target?.closest('[data-assistant-launcher]')) {
          return;
        }
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  function toggle(): void {
    setOpen((current) => !current);
    setPulse(false);
    window.sessionStorage.setItem(SEEN_KEY, '1');
  }

  const home = role === 'owner' ? ROUTES.owner.assistant : ROUTES.reseller.assistant;

  return (
    <>
      {open ? (
        <div ref={panelRef} className="assistant-panel" role="dialog" aria-label="BTC Assistant">
          <header className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
            <span className="text-[var(--accent-soft)]" aria-hidden="true">
              ◆
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--text-1)]">BTC Assistant</p>
              <p className="text-xs text-[var(--text-3)]">Powered by Claude</p>
            </div>
            <button type="button" className="flex h-11 w-11 items-center justify-center" aria-label="Expand assistant" onClick={() => router.push(home)}>
              <Maximize2 size={16} />
            </button>
            <button type="button" className="flex h-11 w-11 items-center justify-center" aria-label="Close assistant" onClick={() => setOpen(false)}>
              <X size={16} />
            </button>
          </header>
          <AssistantChat messages={messages} onMessages={setMessages} compact />
        </div>
      ) : null}
      <div className="assistant-launcher">
        <span className="assistant-label">Ask AI</span>
        <button
          type="button"
          data-assistant-launcher
          className={`assistant-button${pulse ? ' is-pulsing' : ''}`}
          aria-expanded={open}
          aria-label="Ask AI"
          onClick={toggle}
        >
          <MessageSquare size={22} aria-hidden="true" />
          {messages.length === 0 ? <span className="assistant-unread" aria-hidden="true" /> : null}
        </button>
      </div>
    </>
  );
}
