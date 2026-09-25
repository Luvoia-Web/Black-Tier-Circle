import { BaseSupplierAdapter } from '@/integrations/supplier/adapters/base-adapter';
import type { CatalogBalance, CatalogOrderResult, CatalogSupplierProduct, ConnectionTest } from '@/integrations/supplier/adapter-types';

const AUTH_ATTEMPTS: ReadonlyArray<{ name: string; format: 'bare' | 'bearer'; headers: (key: string) => Record<string, string> }> = [
  { name: 'Authorization', format: 'bearer', headers: (key) => ({ Authorization: `Bearer ${key}` }) },
  { name: 'X-API-Key', format: 'bare', headers: (key) => ({ 'X-API-Key': key }) },
  { name: 'Authorization', format: 'bare', headers: (key) => ({ Authorization: key }) },
  { name: 'Api-Key', format: 'bare', headers: (key) => ({ 'Api-Key': key }) },
  { name: 'X-Auth-Token', format: 'bare', headers: (key) => ({ 'X-Auth-Token': key }) },
];

const PRODUCT_PATHS = ['/products', '/v1/products', '/v2/products', '/api/products', '/api/v1/products', '/api/v2/products'];

function productList(json: unknown): unknown[] {
  if (Array.isArray(json)) {
    return json;
  }
  if (json && typeof json === 'object') {
    const record = json as Record<string, unknown>;
    if (Array.isArray(record.products)) {
      return record.products;
    }
    if (Array.isArray(record.data)) {
      return record.data;
    }
  }
  return [];
}

/**
 * Tries common REST auth and product paths when the key has no known prefix.
 */
export class GenericAdapter extends BaseSupplierAdapter {
  readonly name = 'Supplier';
  readonly keyPrefix = null;

  async testConnection(apiKey: string, endpoint?: string): Promise<ConnectionTest> {
    const baseUrl = endpoint?.trim().replace(/\/$/, '') ?? '';
    const empty = {
      adapterName: 'generic',
      baseUrl,
      authHeaderName: 'Authorization',
      authHeaderFormat: 'bearer' as const,
      productsEndpoint: '/products',
      ordersEndpoint: '/orders',
      balanceEndpoint: '/balance',
      apiVersion: 'v1',
    };
    if (!baseUrl) {
      return { ...empty, success: false, error: 'Add the supplier API endpoint so the key can be checked.' };
    }
    for (const auth of AUTH_ATTEMPTS) {
      for (const path of PRODUCT_PATHS) {
        try {
          const response = await fetch(`${baseUrl}${path}`, { headers: { ...auth.headers(apiKey), Accept: 'application/json' } });
          if (response.status === 401 || response.status === 403) {
            continue;
          }
          if (!response.ok) {
            continue;
          }
          const json = (await response.json()) as unknown;
          const products = productList(json);
          if (products.length === 0 && !json) {
            continue;
          }
          return {
            ...empty,
            success: true,
            supplierName: 'Supplier',
            productCount: products.length,
            authHeaderName: auth.name,
            authHeaderFormat: auth.format,
            productsEndpoint: path,
          };
        } catch {
          continue;
        }
      }
    }
    return { ...empty, success: false, error: 'Could not connect. Check your API key and endpoint, then try again.' };
  }

  async getProducts(apiKey: string, endpoint?: string): Promise<CatalogSupplierProduct[]> {
    const tested = await this.testConnection(apiKey, endpoint);
    if (!tested.success) {
      throw new Error(tested.error ?? 'Could not load supplier products.');
    }
    const headers =
      tested.authHeaderFormat === 'bearer'
        ? { Authorization: `Bearer ${apiKey}` }
        : { [tested.authHeaderName]: apiKey };
    const response = await fetch(`${tested.baseUrl}${tested.productsEndpoint}`, { headers });
    const json = (await response.json()) as unknown;
    return productList(json).map((item, index) => {
      const row = item as Record<string, unknown>;
      return {
        externalId: String(row.id ?? row.product_id ?? row.productId ?? index),
        title: String(row.name ?? row.title ?? 'Product'),
        price: Number(row.price ?? 0),
        stock: 'unlimited' as const,
        deliveryType: 'instant' as const,
      };
    });
  }

  async createOrder(): Promise<CatalogOrderResult> {
    throw new Error('This supplier is connected for catalog import. Order placement is not available for this API yet.');
  }

  async getOrderStatus(_apiKey: string, externalOrderId: string): Promise<CatalogOrderResult> {
    return { externalOrderId, status: 'pending' };
  }

  async getBalance(): Promise<CatalogBalance | null> {
    return null;
  }
}
