import { CanbosoAdapter } from '@/integrations/supplier/adapters/canboso-adapter';
import { GenericAdapter } from '@/integrations/supplier/adapters/generic-adapter';
import { ProdSellerAdapter } from '@/integrations/supplier/adapters/prodseller-adapter';
import type { BaseSupplierAdapter } from '@/integrations/supplier/adapters/base-adapter';
import type { ConnectionTest } from '@/integrations/supplier/adapter-types';

const ADAPTERS: ReadonlyArray<BaseSupplierAdapter> = [new ProdSellerAdapter(), new CanbosoAdapter()];
const GENERIC_ADAPTER = new GenericAdapter();

export function detectAdapter(apiKey: string): BaseSupplierAdapter {
  for (const adapter of ADAPTERS) {
    if (adapter.keyPrefix && apiKey.startsWith(adapter.keyPrefix)) {
      return adapter;
    }
  }
  return GENERIC_ADAPTER;
}

export function adapterByName(name: string | null | undefined): BaseSupplierAdapter {
  if (name === 'canboso') {
    return new CanbosoAdapter();
  }
  if (name === 'prodseller') {
    return new ProdSellerAdapter();
  }
  return GENERIC_ADAPTER;
}

export async function testSupplierConnection(apiKey: string, endpoint?: string): Promise<ConnectionTest> {
  return detectAdapter(apiKey).testConnection(apiKey, endpoint);
}
