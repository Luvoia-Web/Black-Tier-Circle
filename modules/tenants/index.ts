/**
 * @file modules/tenants/index.ts
 *
 * Tenant public API.
 *
 * INVARIANT: tenant IDs used in queries come from session, not request body,
 * except owner admin lookups which use a verified owner session plus service role.
 *
 * @module Tenants
 */

import { AppError, NotFoundError, TenantError } from '@/lib/errors';
import type { DbClient, QueryResult } from '@/lib/supabase/query';
import type { AccountStatus } from '@/modules/identity';
import { updateProfile } from '@/modules/identity';
import type { ResellerListItem, Tenant, TenantRow } from './types';

export type { ResellerListItem, Tenant, TenantRow } from './types';

const SANDBOX_NOW = new Date('2026-01-01T00:00:00.000Z');

const SANDBOX_TENANT: Tenant = {
  id: '00000000-0000-4000-8000-000000000010',
  ownerUserId: '00000000-0000-4000-8000-000000000002',
  displayName: 'Sandbox Reseller',
  businessName: 'Sandbox Notes Co',
  supportContact: 'sandbox@example.test',
  status: 'active',
  createdAt: SANDBOX_NOW,
  updatedAt: SANDBOX_NOW,
};

/**
 * Loads a tenant after verifying it matches the session tenant.
 *
 * @param sessionTenantId - Tenant ID derived from the authenticated session
 * @param requestedTenantId - Tenant ID the caller wants to load
 * @returns Sandbox tenant when IDs match
 * @throws TenantError when the caller asks for a different tenant
 */
export function getTenantForSession(sessionTenantId: string, requestedTenantId: string): Tenant {
  if (sessionTenantId !== requestedTenantId) {
    throw new TenantError('TENANT_MISMATCH', 'Tenant scope does not match the session');
  }
  if (requestedTenantId !== SANDBOX_TENANT.id) {
    throw new TenantError('TENANT_NOT_FOUND', 'Unknown tenant in sandbox', 404);
  }
  return SANDBOX_TENANT;
}

function asTenantRow(data: unknown): TenantRow {
  return data as TenantRow;
}

function mapTenantRow(row: TenantRow): Tenant {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    displayName: row.display_name,
    businessName: row.business_name,
    supportContact: row.support_contact,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Gets the tenant belonging to this reseller.
 *
 * @param supabase - Database client
 * @param userId - Reseller profile / auth user ID
 * @throws NotFoundError if none
 */
export async function getTenantByUserId(supabase: DbClient, userId: string): Promise<Tenant> {
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('owner_user_id', userId)
    .maybeSingle();
  if (error) {
    throw new AppError('TENANT_LOOKUP_FAILED', error.message, 500);
  }
  if (data === null) {
    throw new NotFoundError('Tenant');
  }
  return mapTenantRow(asTenantRow(data));
}

/**
 * Creates a new tenant for a reseller during invite acceptance.
 * Status starts as pending — the owner must activate.
 *
 * @param supabase - Database client
 * @param userId - Reseller user ID
 * @param displayName - Tenant display name
 */
export async function createTenant(
  supabase: DbClient,
  userId: string,
  displayName: string,
): Promise<Tenant> {
  const { data, error } = await supabase
    .from('tenants')
    .insert({
      owner_user_id: userId,
      display_name: displayName,
      status: 'pending',
    })
    .select('*')
    .single();
  if (error || data === null) {
    throw new AppError('TENANT_CREATE_FAILED', error?.message ?? 'Unable to create tenant', 500);
  }
  return mapTenantRow(asTenantRow(data));
}

/**
 * Owner use: fetch any tenant by ID. Caller must pass a service-role client.
 *
 * @param supabase - Service-role database client
 * @param tenantId - Tenant ID
 */
export async function getTenantById(supabase: DbClient, tenantId: string): Promise<Tenant> {
  const { data, error } = await supabase.from('tenants').select('*').eq('id', tenantId).maybeSingle();
  if (error) {
    throw new AppError('TENANT_LOOKUP_FAILED', error.message, 500);
  }
  if (data === null) {
    throw new NotFoundError('Tenant');
  }
  return mapTenantRow(asTenantRow(data));
}

/**
 * Owner use: list all tenants. Service role only.
 *
 * @param supabase - Service-role database client
 */
export async function listTenants(supabase: DbClient): Promise<Tenant[]> {
  const result = (await supabase
    .from('tenants')
    .select('*')
    .order('created_at', { ascending: false })) as QueryResult<unknown[] | null>;
  if (result.error) {
    throw new AppError('TENANT_LIST_FAILED', result.error.message, 500);
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows.map((row) => mapTenantRow(asTenantRow(row)));
}

/**
 * Owner only: activate or suspend a reseller tenant and matching profile.
 *
 * @param supabase - Service-role database client
 * @param tenantId - Tenant ID
 * @param status - Target status
 */
export async function updateTenantStatus(
  supabase: DbClient,
  tenantId: string,
  status: Extract<AccountStatus, 'active' | 'suspended'>,
): Promise<Tenant> {
  const existing = await getTenantById(supabase, tenantId);
  const { data, error } = await supabase
    .from('tenants')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', tenantId)
    .select('*')
    .single();
  if (error || data === null) {
    throw new AppError('TENANT_UPDATE_FAILED', error?.message ?? 'Unable to update tenant', 500);
  }
  await updateProfile(supabase, existing.ownerUserId, { status });
  return mapTenantRow(asTenantRow(data));
}

/**
 * Reseller: update the store display name from the session tenant.
 */
export async function updateTenantDisplayName(
  supabase: DbClient,
  tenantId: string,
  displayName: string,
): Promise<Tenant> {
  const trimmed = displayName.trim();
  if (trimmed.length < 2 || trimmed.length > 80) {
    throw new AppError('INVALID_STORE_NAME', 'Store name must be between 2 and 80 characters', 400);
  }
  const { data, error } = await supabase
    .from('tenants')
    .update({ display_name: trimmed, updated_at: new Date().toISOString() })
    .eq('id', tenantId)
    .select('*')
    .single();
  if (error || data === null) {
    throw new AppError('TENANT_UPDATE_FAILED', error?.message ?? 'Unable to update store name', 500);
  }
  return mapTenantRow(asTenantRow(data));
}

/**
 * Combines tenants with profile names. Emails are filled by the API using Auth admin.
 *
 * @param supabase - Service-role database client
 */
export async function listResellerRows(supabase: DbClient): Promise<ResellerListItem[]> {
  const tenants = await listTenants(supabase);
  const items: ResellerListItem[] = [];
  for (const tenant of tenants) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', tenant.ownerUserId)
      .maybeSingle();
    if (error) {
      throw new AppError('PROFILE_LOOKUP_FAILED', error.message, 500);
    }
    const profile = data as {
      display_name?: string;
      status?: AccountStatus;
    } | null;
    items.push({
      tenantId: tenant.id,
      displayName: profile?.display_name ?? tenant.displayName,
      email: '',
      tenantName: tenant.displayName,
      status: tenant.status,
      profileStatus: profile?.status ?? tenant.status,
      joinedAt: tenant.createdAt,
    });
  }
  return items;
}
