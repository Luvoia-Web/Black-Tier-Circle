/**
 * @file tests/unit/invitations.test.ts
 *
 * Unit tests for invitation token evaluation and accept-time validation.
 *
 * @module Tests
 */

import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/lib/errors';
import { assertInvitationAcceptable, evaluateInvitationToken, type InvitationRow } from '@/modules/identity';

const NOW = new Date('2026-09-21T12:00:00.000Z');

function invitation(overrides: Partial<InvitationRow> = {}): InvitationRow {
  return {
    id: 'inv-1',
    email: 'reseller@example.test',
    role: 'reseller',
    token: 'token-1',
    expires_at: '2026-09-28T12:00:00.000Z',
    accepted_at: null,
    invited_by: 'owner-1',
    created_at: '2026-09-21T12:00:00.000Z',
    ...overrides,
  };
}

describe('evaluateInvitationToken', () => {
  it('returns valid: false for an expired invitation token', () => {
    const result = evaluateInvitationToken(
      invitation({ expires_at: '2026-09-20T12:00:00.000Z' }),
      NOW,
    );
    expect(result.valid).toBe(false);
    expect(result.expired).toBe(true);
    expect(result.email).toBe('reseller@example.test');
  });

  it('returns valid: false for an already accepted invitation', () => {
    const result = evaluateInvitationToken(
      invitation({ accepted_at: '2026-09-21T11:00:00.000Z' }),
      NOW,
    );
    expect(result.valid).toBe(false);
    expect(result.expired).toBe(false);
  });

  it('returns email and valid: true for a live token', () => {
    const result = evaluateInvitationToken(invitation(), NOW);
    expect(result).toEqual({
      email: 'reseller@example.test',
      valid: true,
      expired: false,
    });
  });
});

describe('assertInvitationAcceptable', () => {
  it('throws ValidationError when the accept email does not match', () => {
    expect(() => assertInvitationAcceptable(invitation(), 'other@example.test', NOW)).toThrow(
      ValidationError,
    );
    expect(() => assertInvitationAcceptable(invitation(), 'other@example.test', NOW)).toThrow(
      /email/i,
    );
  });
});
