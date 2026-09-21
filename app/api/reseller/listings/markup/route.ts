/**
 * @file app/api/reseller/listings/markup/route.ts
 *
 * POST: apply bulk markup % and clear per-product overrides.
 *
 * Phase 9 auth audit: getUser() via requireReseller.
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { ApplyMarkupSchema } from '@/lib/validations/tenant-settings';
import { applyBulkMarkup } from '@/modules/pricing';
import { updateTenantSettings } from '@/modules/tenant-settings';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireReseller();
    const parsed = ApplyMarkupSchema.parse(await readJsonBody(request));
    const db = asDbClient(session.admin);
    await updateTenantSettings(db, session.tenant.id, { markupPercent: parsed.markupPercent });
    const listings = await applyBulkMarkup(db, session.tenant.id, parsed.markupPercent);
    return jsonSuccess({ listings, markupPercent: parsed.markupPercent });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
