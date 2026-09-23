/**
 * @file components/settings/Toggle.tsx
 *
 * On/off switch for a settings flag.
 */

type ToggleProps = {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label: string;
};

export function Toggle({ checked, onChange, label }: ToggleProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="flex items-center justify-between gap-3 text-sm"
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <span
        className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-[var(--green)]' : 'bg-[var(--bg-raised)]'}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
        />
      </span>
    </button>
  );
}
