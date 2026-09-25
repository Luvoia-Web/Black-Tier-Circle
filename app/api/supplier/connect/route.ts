/**
 * @file app/api/supplier/connect/route.ts
 *
 * Tests a supplier API key, then stores it encrypted.
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { SupplierError } from '@/integrations/prodseller/client';
import { testSupplierConnection } from '@/integrations/supplier/supplier-client';
import { handleRouteError, jsonError, jsonSuccess, readJsonBody } from '@/lib/http';
import { AppError } from '@/lib/errors';
import { connectSupplier } from '@/modules/supplier';
import { z } from 'zod';

const Body = z.object({
  name: z.string().min(2).max(80),
  apiKey: z.string().min(8).max(200),
  endpoint: z.union([z.string().url(), z.literal('')]).optional(),
  save: z.boolean().optional(),
});

function toUserError(err: unknown, statusCode?: number): string | null {
  const msg = String(err instanceof Error ? err.message : '').toLowerCase();
  if (msg.includes('solde insuffisant') || msg.includes('not enough') || msg.includes('insufficient')) {
    return null;
  }
  if (msg.includes('clé') || msg.includes('invalid key') || msg.includes('invalid api key') || statusCode === 401) {
    return 'Invalid API key. Double-check and try again.';
  }
  if (statusCode === 403) {
    return 'This API key does not have permission. Check your supplier account settings.';
  }
  if (statusCode === 404) {
    return 'Supplier API not found at that endpoint. Check the URL.';
  }
  if (statusCode === 429) {
    return 'Too many requests. Wait a moment and try again.';
  }
  if (msg.includes('enotfound') || msg.includes('network')) {
    return 'Cannot reach the supplier. Check the endpoint URL.';
  }
  if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('timed out')) {
    return 'Connection timed out. The supplier is not responding.';
  }
  return 'Could not connect. Check your API key and try again.';
}

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
      const probed = await testSupplierConnection(body.apiKey, body.endpoint);
      if (!probed.success) {
        return jsonError(new AppError('SUPPLIER_CONNECT_FAILED', probed.error ?? 'Could not connect. Check your API key and try again.', 400));
      }
      return jsonSuccess({
        username: probed.supplierName ?? 'Supplier',
        balance: probed.balance?.available ?? 0,
        membership: probed.balance?.currency ?? 'USDT',
        productCount: probed.productCount ?? 0,
        warning: probed.warning ?? null,
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
      warning: saved.warning,
    });
  } catch (error: unknown) {
    if (error instanceof SupplierError) {
      const message = toUserError(error, error.status) ?? 'Connected, but the supplier balance is low. Top up before ordering.';
      return jsonError(new AppError(error.code, message, error.status >= 400 ? error.status : 400));
    }
    if (error instanceof z.ZodError) {
      return handleRouteError(error);
    }
    return jsonError(new AppError('SUPPLIER_CONNECT_FAILED', toUserError(error) ?? 'Could not connect. Check your API key and try again.', 400));
  }
}
