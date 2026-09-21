/**
 * @file lib/api-config.ts
 *
 * Public API configuration — single source of truth.
 * All rate limits, key formats, pagination defaults, and versioning here.
 * Change API behavior by editing this file only.
 */

export const API_CONFIG = {
  /** Current API version prefix */
  version: 'v1' as const,
  baseUrl: '/api/v1',

  /** API key format: btc_live_{32 random hex chars} or btc_test_{32 random hex chars} */
  keyPrefix: {
    live: 'btc_live_',
    test: 'btc_test_',
  },
  keyLength: 40, // prefix + 32 hex chars (approximate; live/test prefixes are 9 chars)

  /** Rate limits per API key (requests per window) */
  rateLimits: {
    /** Default limit for all endpoints */
    defaultRequestsPerMinute: 60,
    /** Order creation — stricter limit */
    orderCreationPerMinute: 10,
    /** Payment verification — moderate limit */
    paymentVerificationPerMinute: 20,
    /** Read endpoints — generous limit */
    readRequestsPerMinute: 120,
  },

  /** Pagination defaults */
  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
  },

  /** Request timeout */
  timeoutMs: 30_000,

  /** Idempotency key header name */
  idempotencyHeader: 'X-Idempotency-Key',

  /** API key header name */
  apiKeyHeader: 'X-API-Key',

  /** Default scopes assigned to new keys */
  defaultScopes: ['orders:read', 'orders:write', 'products:read'] as const,

  allScopes: [
    'orders:read',
    'orders:write',
    'products:read',
    'payments:write',
    'webhook:manage',
  ] as const,

  webhooks: {
    signatureHeader: 'X-BTC-Signature',
    maxFailures: 3,
    retryBackoffMs: [10_000, 30_000, 90_000] as const,
    events: [
      'order.payment_verified',
      'order.fulfilled',
      'order.delivered',
      'order.failed',
      'order.cancelled',
    ] as const,
  },

  /** Standard error codes */
  errors: {
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    RATE_LIMITED: 'RATE_LIMITED',
    IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
    INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
    PRODUCT_UNAVAILABLE: 'PRODUCT_UNAVAILABLE',
    ORDER_ALREADY_PAID: 'ORDER_ALREADY_PAID',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
  },
} as const;

/**
 * Standard API response shape — ALL v1 endpoints return this.
 * Success: { success: true, data: T, meta?: M }
 * Error:   { success: false, error: { code, message, details? } }
 */
export type ApiResponse<T, M = never> =
  | { success: true; data: T; meta?: M }
  | { success: false; error: { code: string; message: string; details?: unknown } };

/** Pagination metadata included in list responses */
export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

/** Standard list response */
export type ListResponse<T> = ApiResponse<T[], PaginationMeta>;
