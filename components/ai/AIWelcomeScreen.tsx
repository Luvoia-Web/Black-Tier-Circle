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
  { mark: '✦', label: 'What does my top customer prefer?' },
  { mark: '📦', label: 'Which products convert best?' },
  { mark: '🔄', label: 'Show me recent recovery patterns' },
  { mark: '🧠', label: 'What has the platform learned?' },
];

const PAGE_CHIPS = [
  { mark: '✦', label: 'Customer Memory', hint: 'What your customers prefer', fill: 'What does my top customer prefer buying and what objections do they raise?' },
  { mark: '📦', label: 'Best Products', hint: 'Top converting items', fill: 'Which products convert best in my store and why?' },
  { mark: '🔄', label: 'Recovery Intel', hint: 'Cart abandonment patterns', fill: 'What are the best cart recovery strategies based on store memory?' },
  { mark: '🧠', label: 'Platform Patterns', hint: 'Cross-store intelligence', fill: 'What patterns has the platform learned across all reseller stores?' },
  { mark: '⚡', label: 'Peak Hours', hint: 'When customers buy most', fill: 'What are the peak commerce hours and when should I run promotions?' },
  { mark: '🎯', label: 'Learning Loop', hint: 'AI pattern upgrades', fill: 'How does the outcome learning loop promote customer patterns to store memory?' },
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
        <p className="ai-hero-lead">I&apos;m your BT Memory AI — powered by MemoryOS.</p>
        <p className="ai-hero-sub">Ask me anything about your customers, store patterns, or platform intelligence.</p>
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
      <p className="ai-welcome-title">Hi! I&apos;m your BT Memory AI.</p>
      <p className="ai-welcome-sub">Ask me about customers, patterns, or store intelligence.</p>
      <div className="ai-chip-grid">
        {PANEL_CHIPS.map((chip, index) => (
          <SuggestionChip key={chip.label} mark={chip.mark} label={chip.label} delay={index * 100} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}