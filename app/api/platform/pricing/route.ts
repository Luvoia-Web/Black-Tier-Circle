/**
 * Store wholesale and retail markup defaults, plus the products that override them.
 */

import { asDbClient, requireUser } from '@/lib/auth/session';
import { AuthError, ValidationError } from '@/lib/errors';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { usdtToMinor } from '@/lib/money';
import { assertRateLimit } from '@/lib/request-rate-limit';
import { applyDefaultPricing, readPricing, savePricingDefaults } from '@/modules/platform/pricing';
import { getTenantByUserId } from '@/modules/tenants';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const Body = z.object({
  wholesaleKind: z.enum(['percent', 'fixed']),
  wholesaleValue: z.string().trim().min(1).max(24),
  retailKind: z.enum(['percent', 'fixed']),
  retailValue: z.string().trim().min(1).max(24),
});

export async function GET(): Promise<Response> {
  try {
    const session = await requireUser();
    const role = session.profile.role;
    if (role !== 'owner' && role !== 'reseller') {
      throw new AuthError('FORBIDDEN', 'You do not have access to pricing', 403);
    }
    const db = asDbClient(session.admin);
    const tenant = role === 'reseller' ? await getTenantByUserId(db, session.user.id) : null;
    return jsonSuccess(await readPricing(db, { role, tenantId: tenant?.id ?? null }));
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function POST(): Promise<Response> {
  try {
    const session = await requireUser();
    if (session.profile.role !== 'owner') {
      throw new AuthError('FORBIDDEN', 'Only the owner can change store pricing', 403);
    }
    await assertRateLimit(`pricing-apply:${session.user.id}`, 10);
    const db = asDbClient(session.admin);
    const result = await applyDefaultPricing(db, session.user.id);
    await db.from('audit_log').insert({
      actor_id: session.user.id,
      tenant_id: null,
      action: 'pricing.apply_defaults',
      target_type: 'pricing',
      target_id: 'defaults',
      reason: 'Applied default pricing rules across products',
    });
    return jsonSuccess(result);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const session = await requireUser();
    if (session.profile.role !== 'owner') {
      throw new AuthError('FORBIDDEN', 'Only the owner can change store pricing', 403);
    }
    await assertRateLimit(`pricing-save:${session.user.id}`, 20);
    const db = asDbClient(session.admin);
    const body = Body.parse(await readJsonBody(request));
    const wholesaleValue = body.wholesaleKind === 'fixed' ? usdtToMinor(body.wholesaleValue).toString() : body.wholesaleValue;
    const retailValue = body.retailKind === 'fixed' ? usdtToMinor(body.retailValue).toString() : body.retailValue;
    if (body.wholesaleKind === 'percent' && (Number(wholesaleValue) < 0 || Number(wholesaleValue) > 999.99)) {
      throw new ValidationError('INVALID_MARKUP', 'Wholesale percent must be between 0 and 999.99');
    }
    if (body.retailKind === 'percent' && (Number(retailValue) < 0 || Number(retailValue) > 999.99)) {
      throw new ValidationError('INVALID_MARKUP', 'Retail percent must be between 0 and 999.99');
    }
    const saved = await savePricingDefaults(db, {
      wholesaleKind: body.wholesaleKind,
      wholesaleValue,
      retailKind: body.retailKind,
      retailValue,
    });
    await db.from('audit_log').insert({
      actor_id: session.user.id,
      tenant_id: null,
      action: 'pricing.defaults',
      target_type: 'pricing',
      target_id: 'defaults',
      reason: 'Saved default wholesale and retail markup rules',
      after_val: { wholesaleKind: body.wholesaleKind, retailKind: body.retailKind },
    });
    return jsonSuccess(saved);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
