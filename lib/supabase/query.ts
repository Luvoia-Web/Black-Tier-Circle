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

export type SignedUrlResult = {
  readonly data: { readonly signedUrl: string } | null;
  readonly error: QueryError | null;
};

/**
 * Minimal Storage surface for private product buckets.
 */
export type StorageBucket = {
  upload: (
    path: string,
    body: File | Blob | ArrayBuffer | Buffer,
    options?: { contentType?: string; upsert?: boolean },
  ) => Promise<QueryResult<{ path: string } | null>>;
  remove: (paths: string[]) => Promise<QueryResult<null>>;
  createSignedUrl: (path: string, expiresIn: number) => Promise<SignedUrlResult>;
};

export type StorageAdapter = {
  from: (bucket: string) => StorageBucket;
};

/**
 * Chainable subset of the Supabase JS query builder used in Phase 1 and 2.
 */
export type QueryBuilder<T> = {
  select: (columns?: string) => QueryBuilder<T>;
  insert: (values: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>) => QueryBuilder<T>;
  update: (values: Record<string, unknown>) => QueryBuilder<T>;
  delete: () => QueryBuilder<T>;
  eq: (column: string, value: string) => QueryBuilder<T>;
  in: (column: string, values: ReadonlyArray<string>) => QueryBuilder<T>;
  is: (column: string, value: null) => QueryBuilder<T>;
  gte: (column: string, value: string) => QueryBuilder<T>;
  lte: (column: string, value: string) => QueryBuilder<T>;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder<T>;
  limit: (count: number) => QueryBuilder<T>;
  range: (from: number, to: number) => QueryBuilder<T>;
  maybeSingle: () => Promise<QueryResult<T | null>>;
  single: () => Promise<QueryResult<T>>;
  then: (
    onfulfilled?: ((value: QueryResult<T[]>) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ) => Promise<unknown>;
};

export type DbClient = {
  from: (relation: string) => QueryBuilder<unknown>;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<QueryResult<unknown>>;
  storage?: StorageAdapter;
};
