/**
 * @file components/ai/AIWelcomeScreen.tsx
 *
 * Empty-state orb and suggestion grid for Remy AI.
 *
 * @module Components
 */

import { AIOrb } from '@/components/ai/AIOrb';
import { SuggestionChip } from '@/components/ai/SuggestionChip';

const OWNER_PANEL_CHIPS = [
  { mark: '✦', label: 'Which products convert best?' },
  { mark: '◇', label: 'Why did a supplier order fail?' },
  { mark: '↻', label: 'Show recent buyer recovery patterns' },
  { mark: '◈', label: 'What has platform memory learned?' },
];

const RESELLER_PANEL_CHIPS = [
  { mark: '✦', label: 'How do I set store margins?' },
  { mark: '◇', label: 'How do I connect my Telegram bot?' },
  { mark: '↻', label: 'Which products convert best in my store?' },
  { mark: '◈', label: 'How do wallet top-ups work?' },
];

const OWNER_PAGE_CHIPS = [
  {
    mark: '✦',
    label: 'Customer Memory',
    hint: 'What buyers prefer',
    fill: 'What do top buyers prefer purchasing and what questions come up before checkout?',
  },
  {
    mark: '◇',
    label: 'Best Products',
    hint: 'Top converting items',
    fill: 'Which products convert best across stores right now and why?',
  },
  {
    mark: '↻',
    label: 'Recovery Intel',
    hint: 'Abandoned checkouts',
    fill: 'What are the best checkout recovery strategies based on store memory?',
  },
  {
    mark: '◈',
    label: 'Platform Patterns',
    hint: 'Cross-store trends',
    fill: 'What operational patterns has platform memory noticed across reseller stores?',
  },
  {
    mark: '⚡',
    label: 'Bot & BEP20 Setup',
    hint: 'Payments and webhooks',
    fill: 'Walk me through verifying BEP20 top-ups, confirmations, and Telegram webhook checks.',
  },
  {
    mark: '◎',
    label: 'Support & Warranty',
    hint: 'Owner replacements',
    fill: 'How do I issue an owner-only warranty replacement linked to a support thread?',
  },
];

const RESELLER_PAGE_CHIPS = [
  {
    mark: '✦',
    label: 'Pricing & Margins',
    hint: 'Wholesale to retail',
    fill: 'How do wholesale prices, category markups, and retail pricing work in my store?',
  },
  {
    mark: '◇',
    label: 'Best Products',
    hint: 'Store performance',
    fill: 'Which products convert best for my store and how should I organize categories?',
  },
  {
    mark: '↻',
    label: 'Telegram Bot',
    hint: 'Connect & customize',
    fill: 'How do I connect my BotFather token and customize greetings in Bot Studio?',
  },
  {
    mark: '◈',
    label: 'Wallet & Debt',
    hint: 'Top-up tokens & balance',
    fill: 'How do I redeem a top-up token and keep my reseller wholesale wallet funded?',
  },
  {
    mark: '⚡',
    label: 'Buyer Support',
    hint: 'Handling tickets',
    fill: 'How do I reply to buyers in the Support inbox and escalate warranty issues to the owner?',
  },
  {
    mark: '◎',
    label: 'API & Webhooks',
    hint: 'Programmatic orders',
    fill: 'How do I create an API key and receive signed webhook delivery updates?',
  },
];

type AIWelcomeScreenProps = {
  readonly variant: 'panel' | 'page';
  readonly displayName?: string;
  readonly role?: 'owner' | 'reseller';
  readonly onPick: (text: string) => void;
};

/**
 * Centered welcome. Greets the signed-in name with role-tailored suggestions.
 */
export function AIWelcomeScreen({
  variant,
  displayName,
  role = 'owner',
  onPick,
}: AIWelcomeScreenProps): JSX.Element {
  if (variant === 'page') {
    const name = displayName?.trim() || 'there';
    const chips = role === 'reseller' ? RESELLER_PAGE_CHIPS : OWNER_PAGE_CHIPS;
    return (
      <div className="ai-welcome is-page">
        <AIOrb size={108} rings />
        <h2 className="ai-hero-title">Hi, {name}!</h2>
        <p className="ai-hero-lead">I&apos;m Remy, your Black Tier Circle assistant.</p>
        <p className="ai-hero-sub">
          {role === 'reseller'
            ? 'Ask anything about your catalogue, pricing, wallet balance, Telegram bot, or buyers.'
            : 'Ask anything about orders, suppliers, resellers, bots, or platform memory.'}
        </p>
        <div className="ai-chip-grid is-page">
          {chips.map((chip, index) => (
            <SuggestionChip
              key={chip.label}
              mark={chip.mark}
              label={chip.label}
              hint={chip.hint}
              large
              delay={index * 60}
              onPick={() => onPick(chip.fill)}
            />
          ))}
        </div>
      </div>
    );
  }

  const panelChips = role === 'reseller' ? RESELLER_PANEL_CHIPS : OWNER_PANEL_CHIPS;
  return (
    <div className="ai-welcome">
      <AIOrb size={76} rings />
      <p className="ai-welcome-title">Hi! I&apos;m Remy.</p>
      <p className="ai-welcome-sub">
        {role === 'reseller'
          ? 'Ask about products, pricing, bots, or wallet top-ups.'
          : 'Ask about buyers, orders, suppliers, or platform memory.'}
      </p>
      <div className="ai-chip-grid">
        {panelChips.map((chip, index) => (
          <SuggestionChip key={chip.label} mark={chip.mark} label={chip.label} delay={index * 80} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}
