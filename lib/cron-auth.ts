/**
 * @file lib/cron-auth.ts
 *
 * Authentication for cron job endpoints.
 * Supports secret via:
 * 1. Authorization: Bearer {CRON_SECRET} header (preferred)
 * 2. ?secret={CRON_SECRET} query parameter (for services that don't support headers)
 *
 * A logged-in owner session is also accepted so dashboard "Run now" buttons
 * work without exposing CRON_SECRET to the browser.
 *
 * Used by: /api/fulfillment/process, /api/supplier/reconcile, /api/bots/health
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth/session';

/**
 * Verifies the cron secret from the incoming request.
 * Returns null if authorized, or a 401 NextResponse if not.
 *
 * @param req - The incoming request
 * @returns null if authorized, NextResponse with 401 if not
 */
export function verifyCronAuth(req: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || cronSecret.startsWith('PLACEHOLDER')) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 401 });
    }
    return null;
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader === `Bearer ${cronSecret}`) {
    return null;
  }

  const url = new URL(req.url);
  const querySecret = url.searchParams.get('secret');
  if (querySecret === cronSecret) {
    return null;
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/**
 * Allows the request when cron auth passes, or when the caller is a logged-in owner.
 *
 * @param req - The incoming request
 * @returns null if authorized, otherwise a 401 response
 */
export async function authorizeCronOrOwner(req: NextRequest): Promise<NextResponse | null> {
  const authError = verifyCronAuth(req);
  if (authError === null) {
    return null;
  }
  try {
    await requireOwner();
    return null;
  } catch {
    return authError;
  }
}
