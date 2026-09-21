/**
 * @file app/api/supplier/health/route.ts
 *
 * GET, owner only. Returns connector.healthCheck() for the active supplier.
 *
 * @module Api
 */

import { getSupplierConnector } from '@/integrations/supplier/connector';
import { requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import { getSupplierModeLabel, SUPPLIER_CONFIG } from '@/lib/supplier-config';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    await requireOwner();
    const connector = getSupplierConnector();
    const healthy = await connector.healthCheck();
    return jsonSuccess({
      healthy,
      supplier: SUPPLIER_CONFIG.activeSupplier,
      mode: getSupplierModeLabel(),
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
