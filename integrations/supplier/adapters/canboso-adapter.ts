import { BaseSupplierAdapter } from '@/integrations/supplier/adapters/base-adapter';
import type { CatalogBalance, CatalogOrderResult, CatalogSupplierProduct, ConnectionTest } from '@/integrations/supplier/adapter-types';

const DEFAULT_BASE = 'https://canboso.com';
const PRODUCTS = '/api/v2/telegram-buyer/products';
const BALANCE = '/api/v2/telegram-buyer/balance';
const PURCHASE = '/api/v2/telegram-buyer/purchase';

type CanbosoProduct = {
  readonly productId?: string;
  readonly name?: string;
  readonly description?: string;
  readonly image?: string;
  readonly productType?: string;
  readonly price?: { readonly amount?: number; readonly currency?: string };
  readonly availability?: { readonly available?: number | null };
};

function baseOf(endpoint?: string): string {
  return (endpoint?.trim() || DEFAULT_BASE).replace(/\/$/, '');
}

function imageUrl(image: string | undefined): string | undefined {
  if (!image) {
    return undefined;
  }
  if (image.startsWith('http')) {
    return image;
  }
  return `${DEFAULT_BASE}${image.startsWith('/') ? '' : '/'}${image}`;
}

function deliveryOf(product: CanbosoProduct): CatalogSupplierProduct['deliveryType'] {
  return product.productType === 'slot' || product.productType === 'upgrade_account' ? 'email_activation' : 'instant';
}

function accountsText(delivery: unknown): string | undefined {
  if (!delivery || typeof delivery !== 'object' || !('accounts' in delivery)) {
    return undefined;
  }
  const accounts = (delivery as { accounts?: Array<Record<string, string | null>> }).accounts;
  if (!accounts || accounts.length === 0) {
    return undefined;
  }
  return accounts
    .map((account) =>
      [account.user, account.password, account.verifyEmail, account.otherInfo].filter((part) => Boolean(part)).join(' · '),
    )
    .join('\n');
}

/**
 * Canboso buyer API. The key travels as `key`, not as an auth header.
 * Spec: https://canboso.com/api/swagger/swagger.json
 */
export class CanbosoAdapter extends BaseSupplierAdapter {
  readonly name = 'Canboso';
  readonly keyPrefix = 'tgb_';

  private async readJson(response: Response): Promise<Record<string, unknown>> {
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return json;
  }

  async testConnection(apiKey: string, endpoint?: string): Promise<ConnectionTest> {
    const baseUrl = baseOf(endpoint);
    const shared = {
      adapterName: 'canboso',
      baseUrl,
      authHeaderName: 'key',
      authHeaderFormat: 'query' as const,
      productsEndpoint: PRODUCTS,
      ordersEndpoint: PURCHASE,
      balanceEndpoint: BALANCE,
      apiVersion: 'v2',
    };
    try {
      const productsResponse = await fetch(`${baseUrl}${PRODUCTS}?key=${encodeURIComponent(apiKey)}`);
      const productsBody = await this.readJson(productsResponse);
      if (productsResponse.status === 401 || productsResponse.status === 403) {
        return { ...shared, success: false, error: 'Invalid API key. Double-check and try again.' };
      }
      if (productsResponse.status === 429) {
        return { ...shared, success: false, error: 'Too many requests. Wait a moment and try again.' };
      }
      if (!productsResponse.ok || productsBody.success === false) {
        return { ...shared, success: false, error: 'Could not connect. Check your API key and try again.' };
      }
      const products = Array.isArray(productsBody.products) ? productsBody.products : [];
      const balance = await this.getBalance(apiKey, endpoint);
      const warning = balance && balance.available <= 0 ? 'Connected, but the supplier balance is low. Top up before ordering.' : undefined;
      return {
        ...shared,
        success: true,
        supplierName: this.name,
        productCount: products.length,
        ...(balance ? { balance } : {}),
        ...(warning ? { warning } : {}),
      };
    } catch {
      return { ...shared, success: false, error: 'Cannot reach the supplier. Check the endpoint URL.' };
    }
  }

  async getProducts(apiKey: string, endpoint?: string): Promise<CatalogSupplierProduct[]> {
    const response = await fetch(`${baseOf(endpoint)}${PRODUCTS}?key=${encodeURIComponent(apiKey)}`);
    if (!response.ok) {
      throw new Error('Could not load supplier products.');
    }
    const body = await this.readJson(response);
    const raw = Array.isArray(body.products) ? (body.products as CanbosoProduct[]) : [];
    return raw.map((product) => {
      const picture = imageUrl(product.image);
      const available = product.availability?.available;
      return {
        externalId: String(product.productId ?? ''),
        title: product.name ?? 'Product',
        ...(product.description ? { description: product.description } : {}),
        price: Number(product.price?.amount ?? 0),
        stock: typeof available === 'number' ? available : 'unlimited',
        ...(picture ? { imageUrl: picture } : {}),
        deliveryType: deliveryOf(product),
      };
    });
  }

  async createOrder(
    apiKey: string,
    productExternalId: string,
    quantity: number,
    customerEmail?: string,
    idempotencyKey?: string,
    endpoint?: string,
  ): Promise<CatalogOrderResult> {
    const response = await fetch(`${baseOf(endpoint)}${PURCHASE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey && idempotencyKey.length >= 8 ? idempotencyKey : `order-${Date.now()}`,
      },
      body: JSON.stringify({
        key: apiKey,
        product_id: productExternalId,
        quantity,
        ...(customerEmail ? { customer_email: customerEmail } : {}),
      }),
    });
    const body = await this.readJson(response);
    if (!response.ok || body.success === false) {
      const message = typeof body.message === 'string' ? body.message.toLowerCase() : '';
      if (message.includes('not enough') || message.includes('insufficient') || message.includes('solde')) {
        throw new Error('Supplier balance is too low to place this order.');
      }
      throw new Error('The supplier could not place this order.');
    }
    const order = (body.order ?? {}) as { orderCode?: string; status?: string; fulfillmentStatus?: string };
    const content = accountsText(body.delivery);
    const completed = order.status === 'completed' && Boolean(content);
    return {
      externalOrderId: String(order.orderCode ?? ''),
      status: completed ? 'delivered' : order.status === 'failed' ? 'failed' : 'pending',
      ...(content ? { deliveredContent: content } : {}),
      ...(customerEmail ? { emailUsed: customerEmail } : {}),
      ...(order.fulfillmentStatus ? { estimatedDelivery: order.fulfillmentStatus } : {}),
    };
  }

  async getOrderStatus(apiKey: string, externalOrderId: string): Promise<CatalogOrderResult> {
    void apiKey;
    return { externalOrderId, status: 'pending' };
  }

  async getBalance(apiKey: string, endpoint?: string): Promise<CatalogBalance | null> {
    try {
      const response = await fetch(`${baseOf(endpoint)}${BALANCE}?key=${encodeURIComponent(apiKey)}`);
      if (!response.ok) {
        return null;
      }
      const body = await this.readJson(response);
      const currency = typeof body.walletCurrency === 'string' ? body.walletCurrency : 'USD';
      const available = typeof body.balance === 'number' ? body.balance : 0;
      return { available, currency };
    } catch {
      return null;
    }
  }
}
