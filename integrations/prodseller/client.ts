/**
 * @file integrations/prodseller/client.ts
 *
 * ProdSeller HTTP client. Auth is an API key header. Requests time out after 20 seconds.
 */

export type ProdSellerProduct = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly price: number;
  readonly publicPrice: number;
  readonly imageUrl: string | null;
  readonly delivery: { readonly type: 'instant' | 'custom' };
  readonly sold: number;
  readonly inStock: boolean;
  readonly requiresEmailActivation: boolean;
};

export type ProdSellerBalance = {
  readonly telegramId: number;
  readonly username: string;
  readonly balance: number;
  readonly membership: string;
};

export type ProdSellerOrderStatus = 'pending' | 'paid' | 'delivered' | 'failed';

export type ProdSellerOrder = {
  readonly orderId: string;
  readonly status: ProdSellerOrderStatus;
  readonly product: { readonly id: string; readonly name: string };
  readonly quantity: number;
  readonly amount: number;
  readonly membershipDiscount?: number;
  readonly discountAmount?: number;
  readonly deliveredKey?: string;
  readonly deliveredKeys?: readonly string[];
  readonly activation?: { readonly emails: readonly string[]; readonly eta: string };
  readonly createdAt: string;
};

export type CreateOrderParams = {
  readonly productId: string;
  readonly quantity?: number;
  readonly email?: string;
  readonly emails?: readonly string[];
  readonly idempotencyKey: string;
};

export class SupplierError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'SupplierError';
    this.code = code;
    this.status = status;
  }
}

const ERROR_CODES: Record<number, string> = {
  401: 'INVALID_API_KEY',
  400: 'BAD_REQUEST',
  402: 'INSUFFICIENT_SUPPLIER_BALANCE',
  404: 'NOT_FOUND',
  409: 'OUT_OF_STOCK',
  500: 'SUPPLIER_SERVER_ERROR',
};

export class ProdSellerClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(apiKey: string, baseUrl = 'https://prodseller.com/v1', authHeaderName = 'X-API-Key') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    const bearer = authHeaderName.endsWith('|Bearer');
    const header = bearer ? authHeaderName.slice(0, -'|Bearer'.length) : authHeaderName;
    this.headers = {
      [header]: bearer ? `Bearer ${apiKey}` : apiKey,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { ...this.headers, ...extraHeaders },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      if (response.status === 429) {
        const retryAfter = response.headers.get('X-RateLimit-Reset') ?? '60';
        throw new SupplierError('RATE_LIMITED', `ProdSeller rate limit hit. Retry after ${retryAfter}s`, 429);
      }
      const data = (await response.json()) as T & { error?: string };
      if (!response.ok) {
        throw new SupplierError(
          ERROR_CODES[response.status] ?? 'SUPPLIER_ERROR',
          data.error ?? `ProdSeller API error ${response.status}`,
          response.status,
        );
      }
      return data;
    } catch (error: unknown) {
      if (error instanceof SupplierError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new SupplierError('SUPPLIER_TIMEOUT', 'ProdSeller API request timed out', 504);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async listProducts(): Promise<ProdSellerProduct[]> {
    const data = await this.request<{ products: ProdSellerProduct[] }>('GET', '/products');
    return data.products;
  }

  async getProduct(productId: string): Promise<ProdSellerProduct> {
    return this.request<ProdSellerProduct>('GET', `/products/${productId}`);
  }

  async getBalance(): Promise<ProdSellerBalance> {
    return this.request<ProdSellerBalance>('GET', '/balance');
  }

  async createOrder(params: CreateOrderParams): Promise<ProdSellerOrder> {
    const { idempotencyKey, ...body } = params;
    return this.request<ProdSellerOrder>('POST', '/orders', body, { 'Idempotency-Key': idempotencyKey });
  }

  async getOrder(orderId: string): Promise<ProdSellerOrder> {
    return this.request<ProdSellerOrder>('GET', `/orders/${orderId}`);
  }

  async listOrders(params?: {
    readonly page?: number;
    readonly limit?: number;
    readonly status?: ProdSellerOrderStatus;
  }): Promise<{ orders: ProdSellerOrder[]; pagination: unknown }> {
    const query = new URLSearchParams();
    if (params?.page) {
      query.set('page', String(params.page));
    }
    if (params?.limit) {
      query.set('limit', String(params.limit));
    }
    if (params?.status) {
      query.set('status', params.status);
    }
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.request<{ orders: ProdSellerOrder[]; pagination: unknown }>('GET', `/orders${suffix}`);
  }
}

export function createProdSellerClient(
  decryptedApiKey: string,
  baseUrl?: string,
  authHeaderName?: string,
): ProdSellerClient {
  return new ProdSellerClient(decryptedApiKey, baseUrl, authHeaderName);
}
