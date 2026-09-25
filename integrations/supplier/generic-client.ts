/**
 * Tries common supplier auth headers and product paths until one responds.
 */

import { SupplierError } from '@/integrations/prodseller/client';
import { isLowBalanceMessage } from '@/lib/supplier-errors';

const AUTH_PATTERNS = [
  { header: 'X-API-Key', format: (key: string) => key },
  { header: 'Authorization', format: (key: string) => `Bearer ${key}` },
  { header: 'Authorization', format: (key: string) => key },
  { header: 'Api-Key', format: (key: string) => key },
  { header: 'X-Auth-Token', format: (key: string) => key },
] as const;

const PRODUCT_PATHS = ['/products', '/v1/products', '/api/products', '/api/v1/products'] as const;

export type ProbeResult = {
  readonly baseUrl: string;
  readonly authHeaderName: string;
  readonly username: string;
  readonly balance: number;
  readonly membership: string;
  readonly productCount: number;
  readonly warning: string | null;
};

type Attempt = {
  readonly ok: boolean;
  readonly status: number;
  readonly body: string;
  readonly json: Record<string, unknown> | null;
};

async function attempt(url: string, header: string, value: string): Promise<Attempt> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { [header]: value, Accept: 'application/json' },
      signal: controller.signal,
    });
    const body = await response.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = JSON.parse(body) as Record<string, unknown>;
    } catch {
      json = null;
    }
    return { ok: response.ok, status: response.status, body, json };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new SupplierError('SUPPLIER_TIMEOUT', 'Connection timed out', 504);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function readBalance(json: Record<string, unknown> | null): { username: string; balance: number; membership: string } {
  const username = typeof json?.username === 'string' ? json.username : 'supplier';
  const balance = typeof json?.balance === 'number' ? json.balance : 0;
  const membership = typeof json?.membership === 'string' ? json.membership : 'standard';
  return { username, balance, membership };
}

function readCount(json: Record<string, unknown> | null): number {
  if (Array.isArray(json?.products)) {
    return json.products.length;
  }
  if (Array.isArray(json?.data)) {
    return json.data.length;
  }
  if (Array.isArray(json)) {
    return json.length;
  }
  return 0;
}

/**
 * Finds a working base URL and auth header for a supplier key.
 */
export async function probeSupplierConnection(apiKey: string, endpoint?: string): Promise<ProbeResult> {
  const trimmed = endpoint?.trim() ?? '';
  const bases = trimmed.length > 0 ? [trimmed.replace(/\/$/, '')] : ['https://prodseller.com/v1'];
  let lastError: unknown = new SupplierError('SUPPLIER_ERROR', 'Could not connect to supplier', 502);

  for (const base of bases) {
    for (const pattern of AUTH_PATTERNS) {
      const value = pattern.format(apiKey);
      const storedHeader = value.startsWith('Bearer ') ? `${pattern.header}|Bearer` : pattern.header;
      try {
        const balanceHit = await attempt(`${base}/balance`, pattern.header, value);
        const message = typeof balanceHit.json?.error === 'string' ? balanceHit.json.error : balanceHit.body;
        if (balanceHit.ok) {
          const account = readBalance(balanceHit.json);
          let productCount = 0;
          for (const path of PRODUCT_PATHS) {
            const products = await attempt(`${base}${path}`, pattern.header, value);
            if (products.ok) {
              productCount = readCount(products.json);
              break;
            }
          }
          return {
            baseUrl: base,
            authHeaderName: storedHeader,
            ...account,
            productCount,
            warning: null,
          };
        }
        if (balanceHit.status === 402 || isLowBalanceMessage(message)) {
          return {
            baseUrl: base,
            authHeaderName: storedHeader,
            username: 'supplier',
            balance: 0,
            membership: 'standard',
            productCount: 0,
            warning: message,
          };
        }
        if (balanceHit.status !== 401 && balanceHit.status !== 403 && balanceHit.status !== 404) {
          lastError = new SupplierError('SUPPLIER_ERROR', message || 'Supplier request failed', balanceHit.status);
        } else {
          lastError = new SupplierError('INVALID_API_KEY', message || 'Invalid API key', balanceHit.status);
        }
      } catch (error: unknown) {
        lastError = error;
      }
    }
  }

  if (lastError instanceof SupplierError) {
    throw lastError;
  }
  throw new SupplierError('SUPPLIER_ERROR', lastError instanceof Error ? lastError.message : 'Could not connect', 502);
}
