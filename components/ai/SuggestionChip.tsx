/**
 * @file components/ai/SuggestionChip.tsx
 *
 * Suggestion that fills the assistant composer.
 *
 * @module Components
 */

type SuggestionChipProps = {
  readonly label: string;
  readonly hint?: string;
  readonly mark?: string;
  readonly delay?: number;
  readonly large?: boolean;
  readonly onPick: (label: string) => void;
};

/**
 * Chip button. The mark is decorative; the label is the accessible name.
 */
export function SuggestionChip({ label, hint, mark, delay = 0, large = false, onPick }: SuggestionChipProps): JSX.Element {
  return (
    <button
      type="button"
      className={`ai-chip${large ? ' is-large' : ''}`}
      style={{ animationDelay: `${delay}ms` }}
      onClick={() => onPick(label)}
    >
      {mark ? <span className="ai-chip-mark" aria-hidden="true">{mark}</span> : null}
      <span>
        <span className="ai-chip-label">{label}</span>
        {hint ? <span className="ai-chip-hint">{hint}</span> : null}
      </span>
    </button>
  );
}
