/**
 * @file components/ai/AITypingIndicator.tsx
 *
 * Three-dot indicator shown while Claude is streaming.
 *
 * @module Components
 */

import { AIOrb } from '@/components/ai/AIOrb';

/**
 * Announces that a reply is being written.
 */
export function AITypingIndicator(): JSX.Element {
  return (
    <div className="ai-typing" role="status" aria-label="Assistant is thinking">
      <AIOrb size={28} thinking />
      <span className="ai-typing-bubble">
        <span className="ai-typing-dot" />
        <span className="ai-typing-dot" />
        <span className="ai-typing-dot" />
      </span>
    </div>
  );
}
