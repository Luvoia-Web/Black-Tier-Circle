/**
 * @file components/platform/ui/fields.tsx
 *
 * Form controls with a label, a hint, and an inline error.
 */

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

type FieldChrome = {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly error?: string;
};

function FieldWrap({ id, label, hint, error, children }: FieldChrome & { readonly children: ReactNode }): JSX.Element {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const described = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-sm text-ink">
        {label}
      </label>
      <div data-describedby={described}>{children}</div>
      {hint ? <p id={hintId} className="mt-1 text-xs text-ink-faint">{hint}</p> : null}
      {error ? <p id={errorId} className="mt-1 text-xs text-fault-ink" style={{ color: 'var(--fault-ink)' }}>{error}</p> : null}
    </div>
  );
}

const CONTROL = 'min-h-11 w-full rounded-md border border-stroke bg-raised px-3 text-sm text-ink placeholder:text-ink-faint disabled:cursor-not-allowed disabled:opacity-45 aria-[invalid=true]:border-[var(--fault)]';

type TextFieldProps = FieldChrome & InputHTMLAttributes<HTMLInputElement>;

export function TextField({ id, label, hint, error, ...rest }: TextFieldProps): JSX.Element {
  return (
    <FieldWrap id={id} label={label} {...(hint ? { hint } : {})} {...(error ? { error } : {})}>
      <input id={id} aria-invalid={Boolean(error)} aria-describedby={[hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined} {...rest} className={CONTROL} />
    </FieldWrap>
  );
}

type AreaFieldProps = FieldChrome & TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextAreaField({ id, label, hint, error, ...rest }: AreaFieldProps): JSX.Element {
  return (
    <FieldWrap id={id} label={label} {...(hint ? { hint } : {})} {...(error ? { error } : {})}>
      <textarea id={id} aria-invalid={Boolean(error)} {...rest} className={`${CONTROL} min-h-24 py-2`} />
    </FieldWrap>
  );
}

type SelectFieldProps = FieldChrome & SelectHTMLAttributes<HTMLSelectElement> & {
  readonly options: readonly { readonly value: string; readonly label: string }[];
};

export function SelectField({ id, label, hint, error, options, ...rest }: SelectFieldProps): JSX.Element {
  return (
    <FieldWrap id={id} label={label} {...(hint ? { hint } : {})} {...(error ? { error } : {})}>
      <select id={id} aria-invalid={Boolean(error)} {...rest} className={CONTROL}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldWrap>
  );
}

type CheckProps = {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly error?: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onChange: (checked: boolean) => void;
};

export function CheckboxField({ id, label, hint, error, checked, disabled, onChange }: CheckProps): JSX.Element {
  return (
    <div>
      <label htmlFor={id} className="flex min-h-11 items-center gap-2 text-sm text-ink">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          className="h-4 w-4 accent-[var(--crimson)] disabled:opacity-45"
          onChange={(event) => onChange(event.target.checked)}
        />
        {label}
      </label>
      {hint ? <p className="text-xs text-ink-faint">{hint}</p> : null}
      {error ? <p className="text-xs" style={{ color: 'var(--fault-ink)' }}>{error}</p> : null}
    </div>
  );
}

type RadioProps = {
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly error?: string;
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
};

export function RadioField({ name, label, value, options, error, disabled, onChange }: RadioProps): JSX.Element {
  return (
    <fieldset disabled={disabled} className="min-w-0 disabled:opacity-45">
      <legend className="mb-1 text-sm text-ink">{label}</legend>
      <div className="flex flex-wrap gap-3">
        {options.map((option) => (
          <label key={option.value} className="flex min-h-11 items-center gap-2 text-sm text-ink">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              className="h-4 w-4 accent-[var(--crimson)]"
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
      {error ? <p className="text-xs" style={{ color: 'var(--fault-ink)' }}>{error}</p> : null}
    </fieldset>
  );
}

type SwitchProps = {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onChange: (checked: boolean) => void;
};

export function SwitchField({ id, label, checked, disabled, onChange }: SwitchProps): JSX.Element {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className="inline-flex min-h-11 items-center gap-3 text-sm text-ink disabled:opacity-45"
      onClick={() => onChange(!checked)}
    >
      <span className={`relative h-6 w-11 rounded-full ${checked ? 'bg-[var(--ok)]' : 'bg-raised'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-ice ${checked ? 'left-5' : 'left-0.5'}`} />
      </span>
      {label}
    </button>
  );
}
