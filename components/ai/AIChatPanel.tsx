/**
 * @file components/ai/AIChatPanel.tsx
 *
 * Glass chat panel that slides up from the launcher.
 *
 * @module Components
 */

import type { ReactNode, RefObject } from 'react';
import { AIOrb } from '@/components/ai/AIOrb';

type AIChatPanelProps = {
  readonly thinking: boolean;
  readonly onExpand: () => void;
  readonly onClose: () => void;
  readonly panelRef: RefObject<HTMLDivElement>;
  readonly children: ReactNode;
};

/**
 * Popup shell. Message content is passed as children.
 */
export function AIChatPanel({ thinking, onExpand, onClose, panelRef, children }: AIChatPanelProps): JSX.Element {
  return (
    <div ref={panelRef} className="ai-panel" role="dialog" aria-label="BTC Assistant">
      <span className="ai-panel-orb ai-panel-orb-a" aria-hidden="true" />
      <span className="ai-panel-orb ai-panel-orb-b" aria-hidden="true" />
      <header className="ai-panel-head">
        <AIOrb size={36} thinking={thinking} />
        <div className="min-w-0 flex-1">
          <p className="ai-panel-title">✦ BT Memory AI</p>
          <p className="ai-panel-powered">Memory Active · Powered by Hindsight</p>
          <p className="ai-status">
            <span className={`ai-status-dot${thinking ? ' is-busy' : ''}`} aria-hidden="true" />
            {thinking ? 'Thinking...' : 'Online'}
          </p>
        </div>
        <button type="button" className="ai-icon-btn" aria-label="Expand assistant" onClick={onExpand}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M9 2h5v5M14 2 9 7M7 14H2V9M2 14l5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" className="ai-icon-btn" aria-label="Close assistant" onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      {children}
    </div>
  );
}
