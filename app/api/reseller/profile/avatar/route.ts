/**
 * @file app/api/reseller/profile/avatar/route.ts
 *
 * Uploads a reseller avatar to the public avatars bucket.
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { updateProfile } from '@/modules/identity';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireReseller();
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      throw new AppError('INVALID_AVATAR', 'Choose an image to upload', 400);
    }
    const extension = TYPES[file.type];
    if (!extension) {
      throw new AppError('INVALID_AVATAR', 'Use a JPG, PNG, or WebP image', 400);
    }
    if (file.size > MAX_BYTES) {
      throw new AppError('INVALID_AVATAR', 'Image must be 2MB or smaller', 400);
    }

    const path = `reseller/${session.user.id}/avatar.${extension}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await session.admin.storage.from('avatars').upload(path, buffer, {
      contentType: file.type,
      upsert: true,
    });
    if (uploadError) {
      throw new AppError('AVATAR_UPLOAD_FAILED', uploadError.message, 500);
    }
    const { data } = session.admin.storage.from('avatars').getPublicUrl(path);
    const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
    const profile = await updateProfile(asDbClient(session.admin), session.user.id, { avatarUrl });
    return jsonSuccess({ avatarUrl: profile.avatarUrl });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
