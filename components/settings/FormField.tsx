/**
 * @file components/settings/FormField.tsx
 *
 * Label, input, and helper text. Password fields can reveal their value.
 */

import { useState } from 'react';

type FormFieldProps = {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly helper?: string;
  readonly placeholder?: string;
  readonly type?: 'text' | 'password';
  readonly multiline?: boolean;
  readonly rows?: number;
};

export function FormField({
  label,
  value,
  onChange,
  helper,
  placeholder,
  type = 'text',
  multiline = false,
  rows = 3,
}: FormFieldProps): JSX.Element {
  const [visible, setVisible] = useState(false);
  const inputType = type === 'password' && !visible ? 'password' : 'text';

  return (
    <label className="mt-3 block text-sm text-[var(--text-2)]">
      <span className="flex items-center justify-between gap-2">
        {label}
        {type === 'password' ? (
          <button
            type="button"
            className="text-xs text-[var(--accent)]"
            onClick={() => setVisible((current) => !current)}
          >
            {visible ? 'Hide' : 'Show'}
          </button>
        ) : null}
      </span>
      {multiline ? (
        <textarea
          className="btc-input mt-1 w-full"
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className="btc-input mt-1 w-full"
          type={inputType}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {helper ? <span className="mt-1 block text-xs text-[var(--text-3)]">{helper}</span> : null}
    </label>
  );
}
