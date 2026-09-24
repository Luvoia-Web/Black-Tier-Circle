/**
 * @file app/api/reseller/profile/password/route.ts
 *
 * Changes the signed-in reseller password after verifying the current one.
 *
 * @module Api
 */

import { requireReseller } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const PasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: 'New passwords do not match',
    path: ['confirmPassword'],
  });

export async function PATCH(request: Request): Promise<Response> {
  try {
    const session = await requireReseller();
    const body = PasswordSchema.parse(await readJsonBody(request));
    const email = session.user.email;
    if (!email) {
      throw new AppError('PASSWORD_UPDATE_FAILED', 'This account has no email password', 400);
    }
    const { error: signInError } = await session.supabase.auth.signInWithPassword({
      email,
      password: body.currentPassword,
    });
    if (signInError) {
      throw new AppError('INVALID_PASSWORD', 'Current password is incorrect', 400);
    }
    const { error: updateError } = await session.supabase.auth.updateUser({ password: body.newPassword });
    if (updateError) {
      throw new AppError('PASSWORD_UPDATE_FAILED', updateError.message, 400);
    }
    return jsonSuccess({ updated: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
