/**
 * @file components/ai/FloatingAIButton.tsx
 *
 * Bottom-right launcher with a rotating border, pulse ring, and hover label.
 *
 * @module Components
 */

type FloatingAIButtonProps = {
  readonly open: boolean;
  readonly unread: number;
  readonly entered: boolean;
  readonly onClick: () => void;
};

function SparkBubble(): JSX.Element {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <path
        d="M6 5.5h10.5a3.5 3.5 0 0 1 3.5 3.5v5.2a3.5 3.5 0 0 1-3.5 3.5H11l-3.6 2.6v-2.6H6A3.5 3.5 0 0 1 2.5 14.2V9A3.5 3.5 0 0 1 6 5.5Z"
        stroke="white"
        strokeWidth="1.6"
      />
      <path d="M18.2 3.2 19 5l1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8.8-1.8Z" fill="white" />
    </svg>
  );
}

/**
 * Fixed launcher. The label is hidden while the panel is open.
 */
export function FloatingAIButton({ open, unread, entered, onClick }: FloatingAIButtonProps): JSX.Element {
  const badge = unread > 9 ? '9+' : String(unread);
  return (
    <div className={`ai-launcher${open ? ' is-open' : ''}${entered ? ' is-entered' : ''}`}>
      <span className="ai-launcher-label">Ask AI</span>
      <span className="ai-pulse-ring" aria-hidden="true" />
      <span className="ai-fab-spin">
        <button
          type="button"
          data-assistant-launcher
          className="ai-fab"
          aria-expanded={open}
          aria-label={unread > 0 ? `Ask AI, ${badge} suggestions` : 'Ask AI'}
          onClick={onClick}
        >
          <SparkBubble />
          {unread > 0 ? <span className="ai-badge">{unread > 1 ? badge : ''}</span> : null}
        </button>
      </span>
    </div>
  );
}
