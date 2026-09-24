/**
 * @file app/api/supplier/settings/[supplierId]/route.ts
 *
 * Updates a supplier connection. The API key is write-only.
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { encrypt } from '@/lib/encryption';
import { AppError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { z } from 'zod';

const Body = z.object({
  name: z.string().min(2).max(80).optional(),
  baseUrl: z.string().url().optional(),
  authHeaderName: z.string().min(2).max(40).optional(),
  apiKey: z.string().min(8).max(200).optional(),
  status: z.enum(['active', 'paused', 'error']).optional(),
});

type RouteContext = { readonly params: { readonly supplierId: string } };

export async function PATCH(request: Request, { params }: RouteContext): Promise<Response> {
  try {
    const session = await requireOwner();
    const body = Body.parse(await readJsonBody(request));
    const patch: Record<string, string> = { updated_at: new Date().toISOString() };
    if (body.name) {
      patch.name = body.name;
    }
    if (body.baseUrl) {
      patch.base_url = body.baseUrl;
    }
    if (body.authHeaderName) {
      patch.auth_header_name = body.authHeaderName;
    }
    if (body.status) {
      patch.status = body.status;
    }
    if (body.apiKey) {
      patch.api_key_encrypted = encrypt(body.apiKey);
    }
    const { error } = await asDbClient(session.admin).from('suppliers').update(patch).eq('id', params.supplierId);
    if (error) {
      throw new AppError('SUPPLIER_UPDATE_FAILED', error.message, 500);
    }
    return jsonSuccess({ updated: true });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
