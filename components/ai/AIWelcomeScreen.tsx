/**
 * @file components/ai/AIWelcomeScreen.tsx
 *
 * Empty-state orb and suggestion grid.
 *
 * @module Components
 */

import { AIOrb } from '@/components/ai/AIOrb';
import { SuggestionChip } from '@/components/ai/SuggestionChip';

const PANEL_CHIPS = [
  { mark: '🤖', label: 'How do I connect my bot?' },
  { mark: '💰', label: 'How does wallet top-up work?' },
  { mark: '🛍', label: 'How do resellers set prices?' },
  { mark: '🔑', label: 'How does auto-delivery work?' },
];

const PAGE_CHIPS = [
  { mark: '🤖', label: 'Connect Your Bot', hint: 'Step by step guide', fill: 'How do I connect my bot?' },
  { mark: '💰', label: 'Wallet & Deposits', hint: 'Top up and manage funds', fill: 'How does wallet top-up work?' },
  { mark: '🛍', label: 'Products & Pricing', hint: 'Add products, set margins', fill: 'How do resellers set prices?' },
  { mark: '🔑', label: 'Auto Delivery', hint: 'How orders are fulfilled', fill: 'How does auto-delivery work?' },
  { mark: '📊', label: 'Analytics', hint: 'Understand your store metrics', fill: 'How do I read store analytics?' },
  { mark: '⚙️', label: 'Settings Help', hint: 'Configure your store bot', fill: 'How do I configure store settings?' },
];

type AIWelcomeScreenProps = {
  readonly variant: 'panel' | 'page';
  readonly displayName?: string;
  readonly onPick: (text: string) => void;
};

/**
 * Centered welcome. Page variant greets the signed-in name.
 */
export function AIWelcomeScreen({ variant, displayName, onPick }: AIWelcomeScreenProps): JSX.Element {
  if (variant === 'page') {
    const name = displayName?.trim() || 'there';
    return (
      <div className="ai-welcome is-page">
        <AIOrb size={120} rings />
        <h2 className="ai-hero-title">Hi, {name}!</h2>
        <p className="ai-hero-lead">I&apos;m your Black Tier Circle AI assistant.</p>
        <p className="ai-hero-sub">Ask me anything about your store, products, or how the platform works.</p>
        <div className="ai-chip-grid is-page">
          {PAGE_CHIPS.map((chip, index) => (
            <SuggestionChip
              key={chip.label}
              mark={chip.mark}
              label={chip.label}
              hint={chip.hint}
              large
              delay={index * 80}
              onPick={() => onPick(chip.fill)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="ai-welcome">
      <AIOrb size={80} rings />
      <p className="ai-welcome-title">Hi! I&apos;m your BTC Assistant.</p>
      <p className="ai-welcome-sub">Ask me anything about the platform.</p>
      <div className="ai-chip-grid">
        {PANEL_CHIPS.map((chip, index) => (
          <SuggestionChip key={chip.label} mark={chip.mark} label={chip.label} delay={index * 100} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}
