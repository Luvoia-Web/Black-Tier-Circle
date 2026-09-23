/**
 * @file components/settings/SettingsCard.tsx
 *
 * Card wrapper for an independently saved settings section.
 */

type SettingsCardProps = {
  readonly title: string;
  readonly description?: string;
  readonly children: React.ReactNode;
  readonly className?: string;
};

export function SettingsCard({ title, description, children, className }: SettingsCardProps): JSX.Element {
  return (
    <section
      className={`rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)] ${className ?? ''}`}
    >
      <h2 className="text-lg font-medium">{title}</h2>
      {description ? <p className="mt-1 text-sm text-[var(--text-2)]">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}
