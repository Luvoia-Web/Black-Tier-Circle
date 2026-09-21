/**
 * @file modules/identity/types.ts
 *
 * Identity domain types aligned with profiles and invitations.
 *
 * @module Identity
 */

export type UserRole = 'owner' | 'reseller' | 'staff';
export type AccountStatus = 'pending' | 'active' | 'suspended';

export type Profile = {
  readonly id: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly status: AccountStatus;
  readonly timezone: string;
  readonly mfaEnabled: boolean;
};

export type SessionActor = {
  readonly profile: Profile;
  readonly tenantId: string | null;
};
