/**
 * @file lib/relative-time.ts
 *
 * Human-readable relative timestamps for dashboard tables.
 *
 * @module Format
 */

/**
 * Formats an ISO date or Date as a relative string such as "3 days ago".
 */
export function formatRelativeTime(value: string | Date | null | undefined): string {
  if (!value) {
    return '—';
  }
  const then = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(then)) {
    return '—';
  }
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 10) {
    return 'just now';
  }
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  const days = Math.round(hours / 24);
  if (days < 30) {
    return days === 1 ? '1 day ago' : `${days} days ago`;
  }
  const months = Math.round(days / 30);
  if (months < 12) {
    return months === 1 ? '1 month ago' : `${months} months ago`;
  }
  const years = Math.round(days / 365);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}
