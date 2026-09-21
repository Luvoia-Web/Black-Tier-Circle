/**
 * @file lib/auth/session.ts
 *
 * Server-side session helpers for API routes.
 * Always uses getUser() so the JWT is verified with Auth.
 *
 * @module Auth
 */

import { AuthError } from '@/lib/errors';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { DbClient } from '@/lib/supabase/query';
import { getProfile, type UserProfile, type UserRole } from '@/modules/identity';
import { getTenantByUserId, type Tenant } from '@/modules/tenants';
import type { User } from '@supabase/supabase-js';

export type AuthenticatedSession = {
  readonly user: User;
  readonly profile: UserProfile;
  readonly supabase: ReturnType<typeof createServerSupabaseClient>;
  readonly admin: ReturnType<typeof createAdminSupabaseClient>;
};

function asDbClient(
  client: ReturnType<typeof createServerSupabaseClient> | ReturnType<typeof createAdminSupabaseClient>,
): DbClient {
  return client as unknown as DbClient;
}

export { asDbClient };

/**
 * Loads the verified user and profile for the current request.
 *
 * @throws AuthError when unauthenticated or the profile is missing
 */
export async function requireUser(): Promise<AuthenticatedSession> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || user === null) {
    throw new AuthError('UNAUTHENTICATED', 'Authentication required');
  }
  const admin = createAdminSupabaseClient();
  const profile = await getProfile(asDbClient(admin), user.id);
  return { user, profile, supabase, admin };
}

/**
 * Requires an authenticated owner.
 */
export async function requireOwner(): Promise<AuthenticatedSession> {
  const session = await requireUser();
  if (session.profile.role !== 'owner') {
    throw new AuthError('FORBIDDEN', 'Owner access required', 403);
  }
  return session;
}

/**
 * Requires one of the listed roles.
 *
 * @param roles - Allowed roles
 */
export async function requireRole(roles: ReadonlyArray<UserRole>): Promise<AuthenticatedSession> {
  const session = await requireUser();
  if (!roles.includes(session.profile.role)) {
    throw new AuthError('FORBIDDEN', 'You do not have access to this resource', 403);
  }
  return session;
}

export type ResellerSession = AuthenticatedSession & {
  readonly tenant: Tenant;
};

/**
 * Requires an authenticated reseller and loads their tenant from the session user.
 * Tenant ID always comes from the database, never from the request body.
 */
export async function requireReseller(): Promise<ResellerSession> {
  const session = await requireUser();
  if (session.profile.role !== 'reseller') {
    throw new AuthError('FORBIDDEN', 'Reseller access required', 403);
  }
  const tenant = await getTenantByUserId(asDbClient(session.admin), session.user.id);
  if (tenant.status === 'suspended') {
    throw new AuthError('ACCOUNT_SUSPENDED', 'This account has been suspended', 403);
  }
  return { ...session, tenant };
}
