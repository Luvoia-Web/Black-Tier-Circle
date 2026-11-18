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
  readonly count?: number | null;
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
  select: (columns?: string, options?: { readonly count?: 'exact'; readonly head?: boolean }) => QueryBuilder<T>;
  insert: (values: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>) => QueryBuilder<T>;
  update: (values: Record<string, unknown>) => QueryBuilder<T>;
  delete: () => QueryBuilder<T>;
  eq: (column: string, value: string | number | boolean) => QueryBuilder<T>;
  in: (column: string, values: ReadonlyArray<string>) => QueryBuilder<T>;
  is: (column: string, value: null) => QueryBuilder<T>;
  gte: (column: string, value: string) => QueryBuilder<T>;
  lte: (column: string, value: string) => QueryBuilder<T>;
  ilike: (column: string, pattern: string) => QueryBuilder<T>;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder<T>;
  limit: (count: number) => QueryBuilder<T>;
  range: (from: number, to: number) => QueryBuilder<T>;
  or: (filters: string) => QueryBuilder<T>;
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

/**
 * The live client can filter only after select(). The in-memory test client
 * can filter first. This wrapper remembers filters and applies them on select
 * when the underlying builder has no eq yet.
 */
export function fromWithEarlyFilters(client: { from: (relation: string) => QueryBuilder<unknown> }): DbClient['from'] {
  return (relation) => {
    const raw = client.from(relation);
    if (typeof raw.eq === 'function') {
      return raw;
    }
    const filters: Array<(query: QueryBuilder<unknown>) => QueryBuilder<unknown>> = [];
    let ordering: { column: string; options?: { ascending?: boolean } } | null = null;
    let limitCount: number | null = null;
    let rangeArgs: [number, number] | null = null;
    const chain = {
      select(columns?: string, options?: { count?: 'exact'; head?: boolean }) {
        let query = (raw as unknown as { select: QueryBuilder<unknown>['select'] }).select(columns, options);
        for (const apply of filters) {
          query = apply(query);
        }
        if (ordering) query = query.order(ordering.column, ordering.options);
        if (limitCount !== null) query = query.limit(limitCount);
        if (rangeArgs) query = query.range(rangeArgs[0], rangeArgs[1]);
        return query;
      },
      insert: (values: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>) => raw.insert(values),
      update: (values: Record<string, unknown>) => raw.update(values),
      delete: () => raw.delete(),
      eq(column: string, value: string | number | boolean) {
        filters.push((query) => query.eq(column, value));
        return chain;
      },
      in(column: string, values: ReadonlyArray<string>) {
        filters.push((query) => query.in(column, values));
        return chain;
      },
      is(column: string, value: null) {
        filters.push((query) => query.is(column, value));
        return chain;
      },
      gte(column: string, value: string) {
        filters.push((query) => query.gte(column, value));
        return chain;
      },
      lte(column: string, value: string) {
        filters.push((query) => query.lte(column, value));
        return chain;
      },
      ilike(column: string, pattern: string) {
        filters.push((query) => query.ilike(column, pattern));
        return chain;
      },
      or(expression: string) {
        filters.push((query) => query.or(expression));
        return chain;
      },
      order(column: string, options?: { ascending?: boolean }) {
        ordering = { column, ...(options ? { options } : {}) };
        return chain;
      },
      limit(count: number) {
        limitCount = count;
        return chain;
      },
      range(from: number, to: number) {
        rangeArgs = [from, to];
        return chain;
      },
      maybeSingle: () => chain.select('*').maybeSingle(),
      single: () => chain.select('*').single(),
      then: (
        onfulfilled?: ((value: QueryResult<unknown[]>) => unknown) | null,
        onrejected?: ((reason: unknown) => unknown) | null,
      ) => chain.select('*').then(onfulfilled, onrejected),
    };
    return chain as QueryBuilder<unknown>;
  };
}
