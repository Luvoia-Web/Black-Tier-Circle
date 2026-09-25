'use client';

import { motion } from 'framer-motion';

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
      className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm"
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <span className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${checked ? 'bg-[var(--green)]' : 'bg-[var(--bg-raised)]'}`}>
        <motion.span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white"
          animate={{ x: checked ? 20 : 2 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        />
      </span>
    </button>
  );
}
