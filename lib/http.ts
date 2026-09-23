/**
 * @file lib/http.ts
 *
 * JSON response helpers for App Router API routes.
 *
 * @module Http
 */

import { NextResponse } from 'next/server';
import { serializeForJson } from '@/lib/api-helpers';
import { AppError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { ZodError } from 'zod';

export type ApiSuccess<T> = {
  readonly success: true;
  readonly data: T;
};

export type ApiFailure = {
  readonly success: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
};

/**
 * Returns a successful JSON payload.
 *
 * @param data - Response body
 * @param status - HTTP status code
 */
const READ_CACHE_HEADERS = {
  'Cache-Control': 'private, max-age=10, stale-while-revalidate=30',
};

export function jsonSuccess<T>(
  data: T,
  status: number = 200,
  options?: { readonly cache?: 'none' | 'short' | 'static' },
): NextResponse<ApiSuccess<unknown>> {
  const cache = options?.cache;
  const init: ResponseInit = { status };
  if (cache === 'none') {
    init.headers = { 'Cache-Control': 'no-store' };
  } else if (cache === 'short') {
    init.headers = READ_CACHE_HEADERS;
  } else if (cache === 'static') {
    init.headers = { 'Cache-Control': 'private, max-age=30' };
  }
  return NextResponse.json({ success: true, data: serializeForJson(data) }, init);
}

/**
 * Returns a failed JSON payload from an application error.
 *
 * @param error - Typed application error
 */
export function jsonError(error: AppError): NextResponse<ApiFailure> {
  return NextResponse.json(
    {
      success: false,
      error: { code: error.code, message: error.message },
    },
    { status: error.statusCode },
  );
}

/**
 * Maps thrown values from route handlers to a consistent error response.
 *
 * @param error - Unknown caught value
 */
export function handleRouteError(error: unknown): NextResponse<ApiFailure> {
  if (error instanceof ZodError) {
    return jsonError(
      new ValidationError('INVALID_INPUT', error.issues[0]?.message ?? 'Invalid request body'),
    );
  }
  if (error instanceof AppError) {
    return jsonError(error);
  }
  logger.error('unhandled api error', {
    message: error instanceof Error ? error.message : 'unknown',
  });
  return jsonError(new AppError('INTERNAL_ERROR', 'Something went wrong', 500));
}

/**
 * Parses a JSON request body, throwing ValidationError when the payload is not an object.
 *
 * @param request - Incoming request
 */
export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new ValidationError('INVALID_INPUT', 'Request body must be a JSON object');
    }
    return body as Record<string, unknown>;
  } catch (error: unknown) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new ValidationError('INVALID_INPUT', 'Request body must be valid JSON');
  }
}
