/**
 * @file app/api/supplier/connect/route.ts
 *
 * Tests a supplier API key, then stores it encrypted.
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { SupplierError } from '@/integrations/prodseller/client';
import { probeSupplierConnection } from '@/integrations/supplier/generic-client';
import { handleRouteError, jsonError, jsonSuccess, readJsonBody } from '@/lib/http';
import { AppError } from '@/lib/errors';
import { translateSupplierError } from '@/lib/supplier-errors';
import { connectSupplier } from '@/modules/supplier';
import { z } from 'zod';

const Body = z.object({
  name: z.string().min(2).max(80),
  apiKey: z.string().min(8).max(200),
  endpoint: z.union([z.string().url(), z.literal('')]).optional(),
  save: z.boolean().optional(),
});

function slugFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return slug.length >= 2 ? slug : 'supplier';
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    const body = Body.parse(await readJsonBody(request));
    if (body.save !== true) {
      const probed = await probeSupplierConnection(body.apiKey, body.endpoint);
      return jsonSuccess({
        username: probed.username,
        balance: probed.balance,
        membership: probed.membership,
        productCount: probed.productCount,
        warning: probed.warning ? translateSupplierError(new Error(probed.warning), 402) : null,
      });
    }
    const saved = await connectSupplier(asDbClient(session.admin), {
      name: body.name,
      slug: slugFromName(body.name),
      apiKey: body.apiKey,
      ...(body.endpoint ? { endpoint: body.endpoint } : {}),
    });
    return jsonSuccess({
      supplierId: saved.supplier.id,
      balance: saved.balance,
      membership: saved.membership,
      username: saved.username,
      productCount: saved.productCount,
      warning: saved.warning ? translateSupplierError(new Error(saved.warning), 402) : null,
    });
  } catch (error: unknown) {
    if (error instanceof SupplierError) {
      return jsonError(new AppError(error.code, translateSupplierError(error, error.status), error.status >= 400 ? error.status : 400));
    }
    if (error instanceof z.ZodError) {
      return handleRouteError(error);
    }
    return jsonError(new AppError('SUPPLIER_CONNECT_FAILED', translateSupplierError(error), 400));
  }
}
