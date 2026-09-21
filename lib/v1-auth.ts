/**
 * @file lib/v1-auth.ts
 *
 * Authentication and authorization helper for all /api/v1/ routes.
 * Every v1 route calls this at the start of the handler.
 *
 * @module V1Auth
 */

import { NextResponse, type NextRequest } from 'next/server';
import { API_CONFIG } from '@/lib/api-config';
import { serializeForJson } from '@/lib/api-helpers';
import { AppError, AuthError, RateLimitError, ValidationError } from '@/lib/errors';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import type { DbClient } from '@/lib/supabase/query';
import { asDbClient } from '@/lib/auth/session';
import { authenticateApiRequest, rateLimit, requireScope, type ApiScope, type AuthenticatedApiContext } from '@/modules/public-api';
import { ZodError } from 'zod';

export type { AuthenticatedApiContext };

export function v1Db(): DbClient {
  return asDbClient(createAdminSupabaseClient());
}

/**
 * Authenticates a v1 request, checks scope, and applies per-key rate limits.
 */
export async function authenticateV1Request(
  req: NextRequest | Request,
  requiredScope: ApiScope,
  rateLimitEndpoint?: string,
  rateLimitCount?: number,
): Promise<AuthenticatedApiContext> {
  const key = req.headers.get(API_CONFIG.apiKeyHeader)?.trim() ?? '';
  if (!key) {
    throw new AuthError(API_CONFIG.errors.UNAUTHORIZED, 'API key required', 401);
  }

  const db = v1Db();
  const context = await authenticateApiRequest(db, key);
  requireScope(context, requiredScope);

  const endpoint = rateLimitEndpoint ?? requiredScope;
  const limit = rateLimitCount ?? API_CONFIG.rateLimits.defaultRequestsPerMinute;
  const limited = await rateLimit(context.apiKeyId, endpoint, limit);
  if (!limited.allowed) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((limited.resetAt.getTime() - Date.now()) / 1000),
    );
    throw new RateLimitError('Rate limit exceeded', retryAfterSeconds);
  }
  return context;
}

/** Standard error response for v1 API */
export function v1Error(
  code: string,
  message: string,
  status: number,
  details?: unknown,
  headers?: HeadersInit,
): NextResponse {
  const errorBody =
    details === undefined
      ? { code, message }
      : { code, message, details };
  const init: { status: number; headers?: HeadersInit } = { status };
  if (headers !== undefined) {
    init.headers = headers;
  }
  return NextResponse.json({ success: false, error: errorBody }, init);
}

/** Standard success response for v1 API */
export function v1Success<T>(data: T, meta?: unknown, status = 200): NextResponse {
  const payload =
    meta === undefined ? { success: true as const, data } : { success: true as const, data, meta };
  return NextResponse.json(serializeForJson(payload), { status });
}

/**
 * Maps thrown values from v1 handlers to the standard error envelope.
 */
export function handleV1Error(error: unknown): NextResponse {
  if (error instanceof RateLimitError) {
    return v1Error(
      API_CONFIG.errors.RATE_LIMITED,
      error.message,
      429,
      error.details,
      { 'Retry-After': String(error.retryAfterSeconds) },
    );
  }
  if (error instanceof ZodError) {
    return v1Error(
      API_CONFIG.errors.VALIDATION_ERROR,
      error.issues[0]?.message ?? 'Invalid request',
      400,
      error.issues,
    );
  }
  if (error instanceof AuthError) {
    return v1Error(error.code, error.message, error.statusCode, error.details);
  }
  if (error instanceof ValidationError) {
    const code =
      error.code === 'PRODUCT_NOT_AVAILABLE'
        ? API_CONFIG.errors.PRODUCT_UNAVAILABLE
        : error.code === 'IDEMPOTENCY_REQUIRED'
          ? API_CONFIG.errors.VALIDATION_ERROR
          : error.code;
    return v1Error(code, error.message, error.statusCode, error.details);
  }
  if (error instanceof AppError) {
    const code =
      error.code === 'INSUFFICIENT_FUNDS' || error.code === 'INSUFFICIENT_AVAILABLE_FUNDS'
        ? API_CONFIG.errors.INSUFFICIENT_FUNDS
        : error.code === 'ORDER_NOT_PAYABLE'
          ? API_CONFIG.errors.ORDER_ALREADY_PAID
          : error.code;
    return v1Error(code, error.message, error.statusCode, error.details);
  }
  return v1Error(API_CONFIG.errors.INTERNAL_ERROR, 'Something went wrong', 500);
}

export function parsePagination(searchParams: URLSearchParams): { page: number; limit: number; offset: number } {
  const rawPage = Number(searchParams.get('page') ?? '1');
  const rawLimit = Number(searchParams.get('limit') ?? String(API_CONFIG.pagination.defaultLimit));
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const limit = Number.isFinite(rawLimit)
    ? Math.min(API_CONFIG.pagination.maxLimit, Math.max(1, Math.floor(rawLimit)))
    : API_CONFIG.pagination.defaultLimit;
  return { page, limit, offset: (page - 1) * limit };
}
