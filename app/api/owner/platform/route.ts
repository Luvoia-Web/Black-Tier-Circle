/**
 * @file app/api/owner/platform/route.ts
 *
 * Pause every reseller store, or export orders, resellers, and products as CSV.
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows: ReadonlyArray<Record<string, unknown>>): string {
  const headers = rows.reduce<string[]>((keys, row) => {
    for (const key of Object.keys(row)) {
      if (!keys.includes(key)) {
        keys.push(key);
      }
    }
    return keys;
  }, []);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((key) => csvCell(row[key])).join(','));
  }
  return lines.join('\n');
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    const body = z.object({ maintenance: z.boolean() }).parse(await readJsonBody(request));
    const db = asDbClient(session.admin);
    const listed = await db.from('tenant_settings').select('tenant_id');
    const rows = Array.isArray(listed.data) ? listed.data : [];
    for (const row of rows) {
      const tenantId = (row as { tenant_id?: string }).tenant_id;
      if (!tenantId) {
        continue;
      }
      await db
        .from('tenant_settings')
        .update({ store_status: body.maintenance ? 'maintenance' : 'open', updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId);
    }
    const platform = await db.from('platform_settings').select('id').limit(1);
    const platformId = Array.isArray(platform.data) ? (platform.data[0] as { id?: string } | undefined)?.id : undefined;
    if (platformId) {
      await db
        .from('platform_settings')
        .update({ maintenance_mode: body.maintenance, updated_at: new Date().toISOString() })
        .eq('id', platformId);
    }
    return jsonSuccess({ maintenance: body.maintenance, stores: rows.length });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

export async function GET(): Promise<Response> {
  try {
    const session = await requireOwner();
    const db = asDbClient(session.admin);
    const [orders, resellers, products] = await Promise.all([
      db.from('orders').select('id, tenant_id, status, created_at'),
      db.from('tenants').select('id, display_name, status, created_at'),
      db.from('products').select('id, title, status, created_at'),
    ]);
    const body = [
      '# orders',
      toCsv(Array.isArray(orders.data) ? (orders.data as Record<string, unknown>[]) : []),
      '',
      '# resellers',
      toCsv(Array.isArray(resellers.data) ? (resellers.data as Record<string, unknown>[]) : []),
      '',
      '# products',
      toCsv(Array.isArray(products.data) ? (products.data as Record<string, unknown>[]) : []),
    ].join('\n');
    return new Response(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="black-tier-circle-export.csv"',
      },
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
