/**
 * @file modules/identity/invitations.ts
 *
 * Invitation token evaluation used by the public invite APIs.
 *
 * @module Identity
 */

import { ValidationError } from '@/lib/errors';
import type { InvitationRow, InvitationValidity } from './types';

/**
 * Evaluates whether an invitation token can still be accepted.
 *
 * @param invitation - Invitation row or null when the token is unknown
 * @param now - Evaluation time
 */
export function evaluateInvitationToken(
  invitation: InvitationRow | null,
  now: Date = new Date(),
): InvitationValidity {
  if (invitation === null) {
    return { email: '', valid: false, expired: false };
  }
  const expired = new Date(invitation.expires_at).getTime() <= now.getTime();
  const accepted = invitation.accepted_at !== null;
  return {
    email: invitation.email,
    valid: !expired && !accepted,
    expired,
  };
}

/**
 * Throws when an invite cannot be accepted for the given email.
 *
 * @param invitation - Invitation row or null
 * @param email - Email submitted on the accept form
 * @param now - Evaluation time
 */
export function assertInvitationAcceptable(
  invitation: InvitationRow | null,
  email: string,
  now: Date = new Date(),
): asserts invitation is InvitationRow {
  if (invitation === null) {
    throw new ValidationError('INVALID_INVITE', 'Invitation is not valid');
  }
  const result = evaluateInvitationToken(invitation, now);
  if (result.expired) {
    throw new ValidationError('INVITE_EXPIRED', 'Invitation has expired');
  }
  if (!result.valid) {
    throw new ValidationError('INVALID_INVITE', 'Invitation is not valid');
  }
  if (invitation.email.toLowerCase() !== email.toLowerCase()) {
    throw new ValidationError('EMAIL_MISMATCH', 'Email does not match this invitation');
  }
}
