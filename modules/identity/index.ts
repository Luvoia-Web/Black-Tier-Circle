/**
 * @file modules/identity/index.ts
 *
 * Identity public API — profiles, sandbox actors, and post-login routing.
 *
 * @module Identity
 */

import { AuthError, NotFoundError, AppError } from '@/lib/errors';
import { dashboardHomeForRole, isSafeNextPath } from '@/lib/navigation';
import type { DbClient } from '@/lib/supabase/query';
import { mapProfileRow } from './map';
import type {
  Profile,
  ProfileDefaults,
  ProfileRow,
  ProfileUpdates,
  SessionActor,
  UserProfile,
  UserRole,
} from './types';

export type {
  AccountStatus,
  InvitationRow,
  InvitationValidity,
  Profile,
  ProfileDefaults,
  ProfileRow,
  ProfileUpdates,
  SessionActor,
  UserProfile,
  UserRole,
} from './types';
export { assertInvitationAcceptable, evaluateInvitationToken } from './invitations';

const SANDBOX_OWNER: Profile = {
  id: '00000000-0000-4000-8000-000000000001',
  displayName: 'Sandbox Owner',
  role: 'owner',
  status: 'active',
  timezone: 'Asia/Kolkata',
  mfaEnabled: false,
};

/**
 * Returns a sandbox actor for local development.
 *
 * @param role - Requested sandbox role
 * @returns Session actor with no tenant for owner, synthetic tenant otherwise
 */
export function getSandboxActor(role: UserRole): SessionActor {
  if (role === 'owner') {
    return { profile: SANDBOX_OWNER, tenantId: null };
  }
  return {
    profile: {
      ...SANDBOX_OWNER,
      id: '00000000-0000-4000-8000-000000000002',
      displayName: 'Sandbox Reseller',
      role,
    },
    tenantId: '00000000-0000-4000-8000-000000000010',
  };
}

/**
 * Stub auth gate used by later route handlers.
 *
 * @param hasSession - Whether a session cookie was present
 * @returns The sandbox owner actor
 * @throws AuthError when no session is present
 */
export function requireActor(hasSession: boolean): SessionActor {
  if (!hasSession) {
    throw new AuthError('UNAUTHENTICATED', 'Authentication required');
  }
  return getSandboxActor('owner');
}

function asProfileRow(data: unknown): ProfileRow {
  return data as ProfileRow;
}

/**
 * Fetches a profile by user ID.
 *
 * @param supabase - Database client
 * @param userId - Auth user ID
 * @throws NotFoundError if missing
 */
export async function getProfile(supabase: DbClient, userId: string): Promise<UserProfile> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) {
    throw new AppError('PROFILE_LOOKUP_FAILED', error.message, 500);
  }
  if (data === null) {
    throw new NotFoundError('Profile');
  }
  return mapProfileRow(asProfileRow(data));
}

/**
 * Gets an existing profile or creates one with the given defaults.
 * Used on first sign-in via the invite flow.
 *
 * @param supabase - Database client
 * @param userId - Auth user ID
 * @param defaults - Values used when inserting a new row
 */
export async function getOrCreateProfile(
  supabase: DbClient,
  userId: string,
  defaults: ProfileDefaults,
): Promise<UserProfile> {
  try {
    return await getProfile(supabase, userId);
  } catch (error: unknown) {
    if (!(error instanceof NotFoundError)) {
      throw error;
    }
  }

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      display_name: defaults.displayName,
      role: defaults.role ?? 'reseller',
      status: defaults.status ?? 'pending',
      timezone: defaults.timezone ?? 'Asia/Kolkata',
      mfa_enabled: false,
    })
    .select('*')
    .single();

  if (error || data === null) {
    throw new AppError('PROFILE_CREATE_FAILED', error?.message ?? 'Unable to create profile', 500);
  }
  return mapProfileRow(asProfileRow(data));
}

/**
 * Updates display name or timezone. Role and status updates are owner-only at the API layer.
 *
 * @param supabase - Database client
 * @param userId - Target profile ID
 * @param updates - Partial profile fields
 */
export async function updateProfile(
  supabase: DbClient,
  userId: string,
  updates: ProfileUpdates,
): Promise<UserProfile> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.displayName !== undefined) {
    patch.display_name = updates.displayName;
  }
  if (updates.timezone !== undefined) {
    patch.timezone = updates.timezone;
  }
  if (updates.role !== undefined) {
    patch.role = updates.role;
  }
  if (updates.status !== undefined) {
    patch.status = updates.status;
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select('*')
    .single();

  if (error || data === null) {
    throw new AppError('PROFILE_UPDATE_FAILED', error?.message ?? 'Unable to update profile', 500);
  }
  return mapProfileRow(asProfileRow(data));
}

/**
 * Resolves the post-login path for a profile, honoring a safe `next` param.
 *
 * @param profile - Authenticated profile
 * @param nextPath - Optional intended destination
 * @throws AuthError when the account is suspended
 */
export function resolvePostLoginPath(profile: UserProfile, nextPath?: string): string {
  if (profile.status === 'suspended') {
    throw new AuthError('ACCOUNT_SUSPENDED', 'This account has been suspended', 403);
  }
  const home = dashboardHomeForRole(profile.role);
  if (nextPath !== undefined && isSafeNextPath(nextPath, profile.role)) {
    return nextPath;
  }
  return home;
}
