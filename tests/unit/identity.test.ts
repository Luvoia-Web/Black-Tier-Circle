/**
 * @file tests/unit/identity.test.ts
 *
 * Unit tests for profile lookup and post-login routing.
 *
 * @module Tests
 */

import { describe, expect, it } from 'vitest';
import { AuthError } from '@/lib/errors';
import { ROUTES } from '@/lib/navigation';
import { completeOnboarding, getOrCreateProfile, resolvePostLoginPath, type UserProfile } from '@/modules/identity';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const NOW = '2026-09-21T10:00:00.000Z';

function profileRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'user-1',
    display_name: 'Ada',
    role: 'reseller',
    status: 'active',
    timezone: 'Asia/Kolkata',
    mfa_enabled: false,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

describe('getOrCreateProfile', () => {
  it('returns existing profile if found', async () => {
    const db = createMemoryDb({ profiles: [profileRow()] });
    const profile = await getOrCreateProfile(db, 'user-1', { displayName: 'Other' });
    expect(profile.displayName).toBe('Ada');
    expect(db.tables.profiles).toHaveLength(1);
  });

  it('creates profile if not found', async () => {
    const db = createMemoryDb();
    const profile = await getOrCreateProfile(db, 'user-2', {
      displayName: 'New Reseller',
      role: 'reseller',
      status: 'pending',
    });
    expect(profile.id).toBe('user-2');
    expect(profile.displayName).toBe('New Reseller');
    expect(profile.role).toBe('reseller');
    expect(profile.status).toBe('pending');
    expect(db.tables.profiles).toHaveLength(1);
  });
});

describe('completeOnboarding', () => {
  it('saves the display name and marks onboarding complete', async () => {
    const db = createMemoryDb({ profiles: [profileRow({ onboarding_completed: false })] });
    const profile = await completeOnboarding(db, 'user-1', {
      displayName: 'Kushal Chaudhari',
      storeName: 'My Awesome Store',
      supportContact: '@kush',
    });
    expect(profile.displayName).toBe('Kushal Chaudhari');
    expect(profile.onboardingCompleted).toBe(true);
    expect(profile.storeName).toBe('My Awesome Store');
    expect(profile.supportContact).toBe('@kush');
  });
});

describe('resolvePostLoginPath', () => {
  it('throws AuthError when the profile is suspended', () => {
    const profile: UserProfile = {
      id: 'user-1',
      displayName: 'Suspended',
      role: 'reseller',
      status: 'suspended',
      timezone: 'Asia/Kolkata',
      mfaEnabled: false,
      onboardingCompleted: true,
      avatarUrl: null,
      storeName: null,
      supportContact: null,
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
    };
    expect(() => resolvePostLoginPath(profile)).toThrow(AuthError);
    expect(() => resolvePostLoginPath(profile)).toThrow(/suspended/i);
  });

  it('sends owners to the owner dashboard', () => {
    const profile: UserProfile = {
      id: 'owner-1',
      displayName: 'Owner',
      role: 'owner',
      status: 'active',
      timezone: 'Asia/Kolkata',
      mfaEnabled: false,
      onboardingCompleted: true,
      avatarUrl: null,
      storeName: null,
      supportContact: null,
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
    };
    expect(resolvePostLoginPath(profile)).toBe(ROUTES.owner.home);
  });

  it('sends a first-time account to onboarding', () => {
    const profile: UserProfile = {
      id: 'user-1',
      displayName: 'New',
      role: 'reseller',
      status: 'active',
      timezone: 'Asia/Kolkata',
      mfaEnabled: false,
      onboardingCompleted: false,
      avatarUrl: null,
      storeName: null,
      supportContact: null,
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
    };
    expect(resolvePostLoginPath(profile)).toBe(ROUTES.onboarding);
  });
});
