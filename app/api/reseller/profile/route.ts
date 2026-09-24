/**
 * @file app/api/reseller/profile/route.ts
 *
 * Reseller personal profile. Store and bot settings stay on /reseller/settings.
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { sanitizeInput } from '@/lib/sanitize';
import { updateProfile } from '@/modules/identity';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  displayName: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
});

export async function GET(): Promise<Response> {
  try {
    const session = await requireReseller();
    return jsonSuccess({
      id: session.profile.id,
      displayName: session.profile.displayName,
      email: session.user.email ?? '',
      role: session.profile.role,
      status: session.profile.status,
      avatarUrl: session.profile.avatarUrl,
      createdAt: session.profile.createdAt.toISOString(),
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const session = await requireReseller();
    const body = PatchSchema.parse(await readJsonBody(request));
    const profile = await updateProfile(asDbClient(session.admin), session.user.id, {
      displayName: sanitizeInput(body.displayName),
    });
    return jsonSuccess({ displayName: profile.displayName });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
