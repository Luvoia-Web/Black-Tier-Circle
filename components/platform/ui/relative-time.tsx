'use client';

/**
 * "3 min ago", with the full local date on hover. Never a raw ISO string.
 */

type RelativeTimeProps = {
  readonly value: string | number | Date;
};

export function RelativeTime({ value }: RelativeTimeProps): JSX.Element {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return <span>Unknown time</span>;
  }
  const full = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  return (
    <time dateTime={date.toISOString()} title={full} className="tabular-nums text-ink-soft">
      {relativeLabel(date)}
    </time>
  );
}

export function relativeLabel(date: Date, now = Date.now()): string {
  const seconds = Math.round((now - date.getTime()) / 1000);
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 1) return 'just now';
  if (Math.abs(minutes) < 60) return `${Math.abs(minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return `${Math.abs(hours)} hr ago`;
  const days = Math.round(hours / 24);
  return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
}
