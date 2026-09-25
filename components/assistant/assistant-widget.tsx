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
import { AIChatPanel } from '@/components/ai/AIChatPanel';
import { FloatingAIButton } from '@/components/ai/FloatingAIButton';
import { AssistantChat, type ChatMessage } from '@/components/assistant/assistant-chat';
import { ROUTES } from '@/lib/navigation';
import type { UserRole } from '@/modules/identity/types';

const SEEN_KEY = 'btc-assistant-seen';

type AssistantWidgetProps = {
  readonly role: UserRole;
  readonly displayName?: string;
};

/**
 * Bottom-right launcher and glass panel. The Claude request stays in AssistantChat.
 */
export function AssistantWidget({ role, displayName }: AssistantWidgetProps): JSX.Element {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [entered, setEntered] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
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
    window.sessionStorage.setItem(SEEN_KEY, '1');
  }

  const home = role === 'owner' ? ROUTES.owner.assistant : ROUTES.reseller.assistant;

  return (
    <>
      {open ? (
        <AIChatPanel
          panelRef={panelRef}
          thinking={thinking}
          onExpand={() => router.push(home)}
          onClose={() => setOpen(false)}
        >
          <AssistantChat
            messages={messages}
            onMessages={setMessages}
            compact
            {...(displayName ? { displayName } : {})}
            onLoadingChange={setThinking}
          />
        </AIChatPanel>
      ) : null}
      <FloatingAIButton open={open} unread={messages.length === 0 ? 1 : 0} entered={entered} onClick={toggle} />
    </>
  );
}
