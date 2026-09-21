/**
 * @file modules/identity/index.ts
 *
 * Identity public API — sandbox session helpers for Phase 0.
 *
 * Real Supabase Auth lookups are added in Phase 1. These functions
 * exist so later modules can depend on a stable signature now.
 *
 * @module Identity
 */

import { AuthError } from '@/lib/errors';
import type { Profile, SessionActor, UserRole } from './types';

export type { AccountStatus, Profile, SessionActor, UserRole } from './types';

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
