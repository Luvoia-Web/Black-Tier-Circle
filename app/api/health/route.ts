/**
 * @file app/api/health/route.ts
 *
 * Enhanced liveness + dependency checks. Never returns stack traces or secrets.
 *
 * @module Api
 */

import { NextResponse } from 'next/server';
import { asDbClient } from '@/lib/auth/session';
import { isPlatformPaymentConfigured } from '@/lib/payment-config';
import { SUPPLIER_CONFIG } from '@/lib/supplier-config';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { getPlatformSettings } from '@/modules/platform';
import { getSupplierConnector } from '@/integrations/supplier/connector';
import packageJson from '../../../package.json';

export const dynamic = 'force-dynamic';

type CheckState = 'ok' | 'error';

async function checkDatabase(): Promise<CheckState> {
  try {
    const admin = createAdminSupabaseClient();
    const { error } = await admin.from('profiles').select('id').limit(1);
    return error ? 'error' : 'ok';
  } catch {
    return 'error';
  }
}

async function checkStorage(): Promise<CheckState> {
  try {
    const admin = createAdminSupabaseClient();
    const { error } = await admin.storage.from('product-files').list('', { limit: 1 });
    return error ? 'error' : 'ok';
  } catch {
    return 'error';
  }
}

async function checkSupplier(): Promise<CheckState> {
  try {
    const healthy = await getSupplierConnector().healthCheck();
    return healthy ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

export async function GET(): Promise<NextResponse> {
  const [database, storage, supplier] = await Promise.all([checkDatabase(), checkStorage(), checkSupplier()]);
  let paymentMode: 'demo' | 'live' = 'demo';
  try {
    const settings = await getPlatformSettings(asDbClient(createAdminSupabaseClient()));
    paymentMode = isPlatformPaymentConfigured(settings) ? 'live' : 'demo';
  } catch {
    paymentMode = 'demo';
  }
  const checks = { database, storage, supplier };
  const values = Object.values(checks);
  let status: 'ok' | 'degraded' | 'error' = 'ok';
  if (values.every((item) => item === 'error')) {
    status = 'error';
  } else if (values.some((item) => item === 'error')) {
    status = 'degraded';
  }
  const httpStatus = status === 'ok' ? 200 : status === 'degraded' ? 200 : 503;

  return NextResponse.json(
    {
      status,
      version: packageJson.version,
      ts: new Date().toISOString(),
      checks,
      mode: {
        payment: paymentMode,
        supplier: SUPPLIER_CONFIG.activeSupplier,
      },
    },
    { status: httpStatus },
  );
}
