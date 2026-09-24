/**
 * @file components/settings/SettingsCard.tsx
 *
 * Card wrapper for an independently saved settings section.
 */

type SettingsCardProps = {
  readonly title: string;
  readonly description?: string;
  readonly icon?: React.ReactNode;
  readonly children: React.ReactNode;
  readonly className?: string;
};

export function SettingsCard({ title, description, icon, children, className }: SettingsCardProps): JSX.Element {
  return (
    <section
      className={`rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)] ${className ?? ''}`}
    >
      <div className="flex items-start gap-3">
        {icon ? (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r-md)] bg-[var(--accent-glow)] text-[var(--accent-soft)]" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <div>
          <h2 className="text-lg font-medium text-[var(--text-1)]">{title}</h2>
          {description ? <p className="mt-1 text-sm text-[var(--text-2)]">{description}</p> : null}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
