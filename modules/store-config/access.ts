import { AuthError, ValidationError } from '@/lib/errors';
import type { DbClient } from '@/lib/supabase/query';
import { DEFAULT_STORE_CONFIG } from '@/modules/store-config/defaults';
import { getStoreConfig, saveStoreConfig } from '@/modules/store-config';
import type { StoredStoreConfig } from '@/modules/store-config/types';

export type StudioScope = 'owner' | 'reseller';

/**
 * Owner always edits the owner row. A reseller edits only the tenant from their session.
 * A tenant id in the request body is never used.
 */
export function tenantIdForStudio(scope: StudioScope, resellerTenantId: string | null): string | null {
  if (scope === 'owner') {
    return null;
  }
  if (!resellerTenantId) {
    throw new AuthError('TENANT_REQUIRED', 'Reseller store was not found', 403);
  }
  return resellerTenantId;
}

export async function readStudio(
  supabase: DbClient,
  scope: StudioScope,
  resellerTenantId: string | null,
): Promise<StoredStoreConfig & { readonly defaults: typeof DEFAULT_STORE_CONFIG }> {
  const stored = await getStoreConfig(supabase, tenantIdForStudio(scope, resellerTenantId));
  return { ...stored, defaults: DEFAULT_STORE_CONFIG };
}

export async function writeStudio(
  supabase: DbClient,
  scope: StudioScope,
  resellerTenantId: string | null,
  body: Record<string, unknown>,
  actorId: string,
): Promise<StoredStoreConfig> {
  if (!('config' in body) || typeof body.version !== 'number' || !Number.isInteger(body.version) || body.version < 0) {
    throw new ValidationError('INVALID_STORE_CONFIG', 'Send the config and its version');
  }
  return saveStoreConfig(
    supabase,
    tenantIdForStudio(scope, resellerTenantId),
    body.config,
    actorId,
    body.version,
  );
}
