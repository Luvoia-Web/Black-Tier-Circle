/**
 * Store wholesale and retail markup defaults, plus the products that override them.
 */

import { asDbClient, requireUser } from '@/lib/auth/session';
import { AuthError, ValidationError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { usdtToMinor } from '@/lib/money';
import { readPricing, savePricingDefaults } from '@/modules/platform/pricing';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const Body = z.object({
  wholesaleKind: z.enum(['percent', 'fixed']),
  wholesaleValue: z.string().trim().min(1).max(24),
  retailKind: z.enum(['percent', 'fixed']),
  retailValue: z.string().trim().min(1).max(24),
});

async function ownerDb() {
  const session = await requireUser();
  if (session.profile.role !== 'owner') {
    throw new AuthError('FORBIDDEN', 'Only the owner can change store pricing', 403);
  }
  return asDbClient(session.admin);
}

export async function GET(): Promise<Response> {
  try {
    const session = await requireUser();
    if (session.profile.role !== 'owner' && session.profile.role !== 'reseller') {
      throw new AuthError('FORBIDDEN', 'You do not have access to pricing', 403);
    }
    return jsonSuccess(await readPricing(asDbClient(session.admin)));
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const db = await ownerDb();
    const body = Body.parse(await readJsonBody(request));
    const wholesaleValue = body.wholesaleKind === 'fixed' ? usdtToMinor(body.wholesaleValue).toString() : body.wholesaleValue;
    const retailValue = body.retailKind === 'fixed' ? usdtToMinor(body.retailValue).toString() : body.retailValue;
    if (body.wholesaleKind === 'percent' && (Number(wholesaleValue) < 0 || Number(wholesaleValue) > 999.99)) {
      throw new ValidationError('INVALID_MARKUP', 'Wholesale percent must be between 0 and 999.99');
    }
    if (body.retailKind === 'percent' && (Number(retailValue) < 0 || Number(retailValue) > 999.99)) {
      throw new ValidationError('INVALID_MARKUP', 'Retail percent must be between 0 and 999.99');
    }
    return jsonSuccess(await savePricingDefaults(db, {
      wholesaleKind: body.wholesaleKind,
      wholesaleValue,
      retailKind: body.retailKind,
      retailValue,
    }));
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
