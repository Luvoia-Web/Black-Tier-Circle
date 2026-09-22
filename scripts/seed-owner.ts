/**
 * @file scripts/seed-owner.ts
 *
 * Owner accounts are created with Google sign-in.
 * Promote a signed-in user to owner from the Supabase profiles table.
 *
 * @module Scripts
 */

console.info('[seed:owner] Owner access uses Google sign-in.');
console.info('[seed:owner] After the owner signs in, set profiles.role to owner in Supabase.');
console.info('[seed:owner] done');
