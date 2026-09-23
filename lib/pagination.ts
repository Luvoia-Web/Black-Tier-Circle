/**
 * @file lib/pagination.ts
 *
 * Shared list pagination for dashboard API routes.
 *
 * @module Pagination
 */

export type PageMeta = {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly hasMore: boolean;
};

/**
 * Parses page and limit from search params with sane caps.
 */
export function parsePageParams(
  searchParams: URLSearchParams,
  defaults: { page?: number; limit?: number; maxLimit?: number } = {},
): { page: number; limit: number; offset: number } {
  const page = Math.max(1, Number(searchParams.get('page') ?? String(defaults.page ?? 1)) || 1);
  const maxLimit = defaults.maxLimit ?? 100;
  const fallback = defaults.limit ?? 20;
  const limit = Math.min(maxLimit, Math.max(1, Number(searchParams.get('limit') ?? String(fallback)) || fallback));
  return { page, limit, offset: (page - 1) * limit };
}

/**
 * Builds a list meta payload.
 */
export function pageMeta(page: number, limit: number, total: number): PageMeta {
  return {
    page,
    limit,
    total,
    hasMore: total > page * limit,
  };
}
