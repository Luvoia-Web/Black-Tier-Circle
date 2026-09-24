/**
 * @file app/api/supplier/connect/route.ts
 *
 * Tests a supplier API key, then stores it encrypted.
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { SupplierError } from '@/integrations/prodseller/client';
import { handleRouteError, jsonError, jsonSuccess, readJsonBody } from '@/lib/http';
import { AppError } from '@/lib/errors';
import { connectSupplier } from '@/modules/supplier';
import { z } from 'zod';

const Body = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/),
  baseUrl: z.string().url(),
  apiKey: z.string().min(8).max(200),
  authHeaderName: z.string().min(2).max(40).default('X-API-Key'),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    const body = Body.parse(await readJsonBody(request));
    const saved = await connectSupplier(asDbClient(session.admin), body);
    return jsonSuccess({
      supplierId: saved.supplier.id,
      balance: saved.balance,
      membership: saved.membership,
      username: saved.username,
    });
  } catch (error: unknown) {
    if (error instanceof SupplierError) {
      return jsonError(new AppError(error.code, error.message, error.status));
    }
    return handleRouteError(error);
  }
}
