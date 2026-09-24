/**
 * @file modules/identity/map.ts
 *
 * Maps profile database rows onto domain types.
 *
 * @module Identity
 */

import type { ProfileRow, UserProfile } from './types';

/**
 * Converts a profiles table row into a UserProfile.
 *
 * @param row - Database row
 */
export function mapProfileRow(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    timezone: row.timezone,
    mfaEnabled: row.mfa_enabled,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    onboardingCompleted: row.onboarding_completed === true,
    avatarUrl: row.avatar_url ?? null,
    storeName: row.store_name ?? null,
    supportContact: row.support_contact ?? null,
  };
}
