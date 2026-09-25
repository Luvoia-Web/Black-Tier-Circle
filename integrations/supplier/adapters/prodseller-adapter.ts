import { SupplierError, createProdSellerClient } from '@/integrations/prodseller/client';
import { BaseSupplierAdapter } from '@/integrations/supplier/adapters/base-adapter';
import { isLowBalanceMessage } from '@/lib/supplier-errors';
import type { CatalogBalance, CatalogOrderResult, CatalogSupplierProduct, ConnectionTest } from '@/integrations/supplier/adapter-types';

const DEFAULT_BASE = 'https://prodseller.com/v1';

/**
 * Wraps the existing supplier HTTP client. psk_ keys keep that path.
 */
export class ProdSellerAdapter extends BaseSupplierAdapter {
  readonly name = 'Catalog supplier';
  readonly keyPrefix = 'psk_';

  private client(apiKey: string, endpoint?: string) {
    return createProdSellerClient(apiKey, endpoint?.trim() || DEFAULT_BASE, 'X-API-Key');
  }

  async testConnection(apiKey: string, endpoint?: string): Promise<ConnectionTest> {
    const baseUrl = (endpoint?.trim() || DEFAULT_BASE).replace(/\/$/, '');
    const shared = {
      adapterName: 'prodseller',
      baseUrl,
      authHeaderName: 'X-API-Key',
      authHeaderFormat: 'bare' as const,
      productsEndpoint: '/products',
      ordersEndpoint: '/orders',
      balanceEndpoint: '/balance',
      apiVersion: 'v1',
    };
    try {
      const client = this.client(apiKey, baseUrl);
      const balance = await client.getBalance();
      const products = await client.listProducts().catch(() => []);
      return {
        ...shared,
        success: true,
        supplierName: balance.username || 'Supplier',
        productCount: products.length,
        balance: { available: balance.balance, currency: 'USDT' },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '';
      if (error instanceof SupplierError && (error.status === 402 || isLowBalanceMessage(message))) {
        return {
          ...shared,
          success: true,
          supplierName: 'Supplier',
          productCount: 0,
          balance: { available: 0, currency: 'USDT' },
          warning: 'Connected, but the supplier balance is low. Top up before ordering.',
        };
      }
      if (error instanceof SupplierError && error.status === 401) {
        return { ...shared, success: false, error: 'Invalid API key. Double-check and try again.' };
      }
      return { ...shared, success: false, error: 'Could not connect. Check your API key and try again.' };
    }
  }

  async getProducts(apiKey: string, endpoint?: string): Promise<CatalogSupplierProduct[]> {
    const products = await this.client(apiKey, endpoint).listProducts();
    return products.map((product) => ({
      externalId: product.id,
      title: product.name,
      description: product.description,
      price: product.price,
      stock: product.inStock ? 'unlimited' : 0,
      ...(product.imageUrl ? { imageUrl: product.imageUrl } : {}),
      deliveryType: product.requiresEmailActivation ? 'email_activation' : 'instant',
    }));
  }

  async createOrder(
    apiKey: string,
    productExternalId: string,
    quantity: number,
    customerEmail?: string,
    idempotencyKey?: string,
    endpoint?: string,
  ): Promise<CatalogOrderResult> {
    const order = await this.client(apiKey, endpoint).createOrder({
      productId: productExternalId,
      quantity,
      idempotencyKey: idempotencyKey ?? `order-${Date.now()}`,
      ...(customerEmail ? { email: customerEmail } : {}),
    });
    const content = order.deliveredKeys?.join('\n') || order.deliveredKey;
    return {
      externalOrderId: order.orderId,
      status: order.status === 'delivered' ? 'delivered' : order.status === 'failed' ? 'failed' : 'pending',
      ...(content ? { deliveredContent: content } : {}),
      ...(customerEmail ? { emailUsed: customerEmail } : {}),
      ...(order.activation?.eta ? { estimatedDelivery: order.activation.eta } : {}),
    };
  }

  async getOrderStatus(apiKey: string, externalOrderId: string, endpoint?: string): Promise<CatalogOrderResult> {
    const order = await this.client(apiKey, endpoint).getOrder(externalOrderId);
    const content = order.deliveredKeys?.join('\n') || order.deliveredKey;
    return {
      externalOrderId,
      status: order.status === 'delivered' ? 'delivered' : order.status === 'failed' ? 'failed' : 'pending',
      ...(content ? { deliveredContent: content } : {}),
    };
  }

  async getBalance(apiKey: string, endpoint?: string): Promise<CatalogBalance | null> {
    const balance = await this.client(apiKey, endpoint).getBalance();
    return { available: balance.balance, currency: 'USDT' };
  }
}
