/**
 * Archived products stay out of the bot and out of reseller listings.
 */

export function isListedInBot(status: string): boolean {
  return status === 'published';
}
