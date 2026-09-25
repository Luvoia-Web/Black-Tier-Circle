import type { CatalogBalance, CatalogOrderResult, CatalogSupplierProduct, ConnectionTest } from '@/integrations/supplier/adapter-types';

export abstract class BaseSupplierAdapter {
  abstract readonly name: string;
  abstract readonly keyPrefix: string | null;

  abstract testConnection(apiKey: string, endpoint?: string): Promise<ConnectionTest>;

  abstract getProducts(apiKey: string, endpoint?: string): Promise<CatalogSupplierProduct[]>;

  abstract createOrder(
    apiKey: string,
    productExternalId: string,
    quantity: number,
    customerEmail?: string,
    idempotencyKey?: string,
    endpoint?: string,
  ): Promise<CatalogOrderResult>;

  abstract getOrderStatus(apiKey: string, externalOrderId: string, endpoint?: string): Promise<CatalogOrderResult>;

  abstract getBalance(apiKey: string, endpoint?: string): Promise<CatalogBalance | null>;
}
