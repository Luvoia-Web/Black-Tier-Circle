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

export type UserProfile = Profile & {
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly onboardingCompleted: boolean;
  readonly avatarUrl: string | null;
  readonly storeName: string | null;
  readonly supportContact: string | null;
};

export type SessionActor = {
  readonly profile: Profile;
  readonly tenantId: string | null;
};

export type ProfileRow = {
  readonly id: string;
  readonly display_name: string;
  readonly role: UserRole;
  readonly status: AccountStatus;
  readonly timezone: string;
  readonly mfa_enabled: boolean;
  readonly created_at: string;
  readonly updated_at: string;
  readonly onboarding_completed?: boolean;
  readonly avatar_url?: string | null;
  readonly store_name?: string | null;
  readonly support_contact?: string | null;
};

export type ProfileDefaults = {
  readonly displayName: string;
  readonly role?: UserRole;
  readonly status?: AccountStatus;
  readonly timezone?: string;
};

export type ProfileUpdates = {
  readonly displayName?: string;
  readonly timezone?: string;
  readonly role?: UserRole;
  readonly status?: AccountStatus;
  readonly onboardingCompleted?: boolean;
  readonly avatarUrl?: string | null;
  readonly storeName?: string | null;
  readonly supportContact?: string | null;
};

export type OnboardingInput = {
  readonly displayName: string;
  readonly storeName?: string | null;
  readonly supportContact?: string | null;
};

export type InvitationRow = {
  readonly id: string;
  readonly email: string;
  readonly role: UserRole;
  readonly token: string;
  readonly expires_at: string;
  readonly accepted_at: string | null;
  readonly invited_by: string;
  readonly created_at: string;
};

export type InvitationValidity = {
  readonly email: string;
  readonly valid: boolean;
  readonly expired: boolean;
};
