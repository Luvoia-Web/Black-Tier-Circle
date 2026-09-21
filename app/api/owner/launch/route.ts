/**
 * @file app/api/owner/launch/route.ts
 *
 * GET, owner only. Launch readiness checklist from live system state.
 *
 * Phase 9 auth audit: getUser() via requireOwner, role=owner.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { evaluateLaunchChecklist } from '@/modules/launch';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const session = await requireOwner();
    const items = await evaluateLaunchChecklist(asDbClient(session.admin));
    return jsonSuccess({ items });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
