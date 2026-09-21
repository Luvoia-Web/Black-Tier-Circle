/**
 * @file integrations/supplier/connector.ts
 *
 * Supplier connector factory and implementations.
 *
 * SANDBOX (default): simulates supplier behavior, no real API calls.
 * LIVE: activated by setting ACTIVE_SUPPLIER=supplier_1 + real credentials.
 *
 * To add a new supplier:
 * 1. Create supplier_2 config in lib/supplier-config.ts
 * 2. Implement createSupplier2Connector() below
 * 3. Add 'supplier_2' case to getSupplierConnector() factory
 * 4. Set ACTIVE_SUPPLIER=supplier_2 in .env
 * Zero other changes needed.
 *
 * SECURITY: Supplier API key read from SUPPLIER_CONFIG, never from request body.
 * SECURITY: supplier response parsed carefully — never eval() or trust raw HTML.
 */

import { AppError } from '@/lib/errors';
import { SUPPLIER_CONFIG } from '@/lib/supplier-config';
import type {
  SupplierConnector,
  SupplierCreateOrderInput,
  SupplierOrderResult,
  SupplierOrderStatus,
  SupplierStatusResult,
} from './types';

export type {
  SupplierConnector,
  SupplierCreateOrderInput,
  SupplierOrderResult,
  SupplierOrderStatus,
  SupplierStatusResult,
} from './types';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  return text.length === 0 ? null : text;
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof AppError) {
    return false;
  }
  return true;
}

// SANDBOX ADAPTER:
function createSandboxSupplierConnector(): SupplierConnector {
  return {
    async createOrder(input: SupplierCreateOrderInput): Promise<SupplierOrderResult> {
      await sleep(SUPPLIER_CONFIG.sandbox.fulfillmentDelayMs);

      if (input.internalOrderId.includes(SUPPLIER_CONFIG.sandbox.failPrefix)) {
        return {
          supplierOrderId: `SANDBOX_FAIL_${input.internalOrderId}`,
          status: 'failed',
          deliveryData: null,
          message: 'Sandbox forced failure',
          completedAt: null,
        };
      }

      if (input.internalOrderId.includes(SUPPLIER_CONFIG.sandbox.unknownPrefix)) {
        return {
          supplierOrderId: `SANDBOX_UNKNOWN_${input.internalOrderId}`,
          status: 'unknown',
          deliveryData: null,
          message: 'Sandbox simulated timeout',
          completedAt: null,
        };
      }

      return {
        supplierOrderId: `SANDBOX_OK_${input.internalOrderId}`,
        status: 'completed',
        deliveryData: 'https://sandbox.example.com/download/TEST_FILE',
        message: 'Sandbox fulfillment complete',
        completedAt: new Date(),
      };
    },

    async getOrderStatus(supplierOrderId: string): Promise<SupplierStatusResult> {
      if (supplierOrderId.includes('UNKNOWN')) {
        return {
          supplierOrderId,
          status: 'unknown',
          deliveryData: null,
          message: null,
          completedAt: null,
        };
      }
      if (supplierOrderId.includes('FAIL')) {
        return {
          supplierOrderId,
          status: 'failed',
          deliveryData: null,
          message: 'Sandbox forced failure',
          completedAt: null,
        };
      }
      return {
        supplierOrderId,
        status: 'completed',
        deliveryData: 'https://sandbox.example.com/download/TEST_FILE',
        message: 'Complete',
        completedAt: new Date(),
      };
    },

    async healthCheck(): Promise<boolean> {
      return true;
    },
  };
}

// SUPPLIER 1 ADAPTER — generic REST adapter
// Customize the request/response mapping for your actual supplier API
function createSupplier1Connector(): SupplierConnector {
  const timeoutMs = SUPPLIER_CONFIG.supplier_1.timeoutMs;
  const maxRetries = SUPPLIER_CONFIG.supplier_1.maxRetries;
  const retryDelayMs = SUPPLIER_CONFIG.supplier_1.retryDelayMs;

  async function fetchSupplierOnce(
    path: string,
    method: 'GET' | 'POST',
    body?: unknown,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${SUPPLIER_CONFIG.supplier_1.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${SUPPLIER_CONFIG.supplier_1.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'BlackTierCircle/1.0',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new AppError('SUPPLIER_HTTP_ERROR', `Supplier returned ${res.status}`, 502);
      }
      return await res.json();
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new AppError('SUPPLIER_TIMEOUT', 'Supplier request timed out', 504);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function fetchSupplier(
    path: string,
    method: 'GET' | 'POST',
    body?: unknown,
  ): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return await fetchSupplierOnce(path, method, body);
      } catch (error: unknown) {
        lastError = error;
        if (!isNetworkError(error) || attempt === maxRetries) {
          throw error;
        }
        await sleep(retryDelayMs);
      }
    }
    throw lastError;
  }

  return {
    async createOrder(input: SupplierCreateOrderInput): Promise<SupplierOrderResult> {
      /**
       * TODO(supplier-integration): Map to your supplier's actual API endpoint and body.
       * This is a generic placeholder. Replace path and body shape with supplier docs.
       *
       * Common patterns:
       * - POST /orders with { reference_id, sku, quantity }
       * - POST /fulfill with { order_id, product_code, customer_id }
       *
       * Map supplier response fields to SupplierOrderResult below.
       */
      const data = asRecord(
        await fetchSupplier('/orders', 'POST', {
          reference_id: input.internalOrderId, // idempotency key
          sku: input.supplierProductSku,
          quantity: input.quantity,
          customer_ref: input.customerRef,
        }),
      );

      return {
        supplierOrderId: String(data['order_id'] ?? data['id'] ?? ''),
        status: mapSupplierStatus(String(data['status'] ?? '')),
        deliveryData:
          optionalString(data['download_url']) ??
          optionalString(data['license_key']) ??
          optionalString(data['delivery_data']),
        message: optionalString(data['message']),
        completedAt: data['completed_at'] ? new Date(String(data['completed_at'])) : null,
      };
    },

    async getOrderStatus(supplierOrderId: string): Promise<SupplierStatusResult> {
      /** TODO(supplier-integration): Map to your supplier's status endpoint */
      const data = asRecord(await fetchSupplier(`/orders/${supplierOrderId}`, 'GET'));
      return {
        supplierOrderId,
        status: mapSupplierStatus(String(data['status'] ?? '')),
        deliveryData: optionalString(data['download_url']) ?? optionalString(data['delivery_data']),
        message: optionalString(data['message']),
        completedAt: data['completed_at'] ? new Date(String(data['completed_at'])) : null,
      };
    },

    async healthCheck(): Promise<boolean> {
      try {
        await fetchSupplier('/health', 'GET');
        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * Maps supplier-specific status strings to our SupplierOrderStatus enum.
 * TODO(supplier-integration): Add your supplier's actual status values here.
 */
export function mapSupplierStatus(raw: string): SupplierOrderStatus {
  const normalized = raw.toLowerCase().trim();
  const statusMap: Record<string, SupplierOrderStatus> = {
    completed: 'completed',
    complete: 'completed',
    success: 'completed',
    fulfilled: 'completed',
    processing: 'processing',
    pending: 'pending',
    in_progress: 'processing',
    failed: 'failed',
    failure: 'failed',
    error: 'failed',
    cancelled: 'cancelled',
    canceled: 'cancelled',
  };
  return statusMap[normalized] ?? 'unknown';
}

/** Factory — returns the active supplier connector */
export function getSupplierConnector(): SupplierConnector {
  switch (SUPPLIER_CONFIG.activeSupplier) {
    case 'supplier_1':
      return createSupplier1Connector();
    case 'sandbox':
    default:
      console.warn('[Supplier] SANDBOX MODE — no real supplier calls');
      return createSandboxSupplierConnector();
  }
}
