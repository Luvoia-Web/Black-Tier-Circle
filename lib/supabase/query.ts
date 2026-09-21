/**
 * @file lib/supabase/query.ts
 *
 * Minimal query-builder surface used by identity and tenant modules.
 * Tests implement this interface instead of calling live Supabase.
 *
 * @module Supabase
 */

export type QueryError = {
  readonly message: string;
  readonly code?: string;
};

export type QueryResult<T> = {
  readonly data: T;
  readonly error: QueryError | null;
};

/**
 * Chainable subset of the Supabase JS query builder used in Phase 1.
 */
export type QueryBuilder<T> = {
  select: (columns?: string) => QueryBuilder<T>;
  insert: (values: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>) => QueryBuilder<T>;
  update: (values: Record<string, unknown>) => QueryBuilder<T>;
  eq: (column: string, value: string) => QueryBuilder<T>;
  is: (column: string, value: null) => QueryBuilder<T>;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder<T>;
  maybeSingle: () => Promise<QueryResult<T | null>>;
  single: () => Promise<QueryResult<T>>;
  then: (
    onfulfilled?: ((value: QueryResult<T[]>) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ) => Promise<unknown>;
};

export type DbClient = {
  from: (relation: string) => QueryBuilder<unknown>;
};
