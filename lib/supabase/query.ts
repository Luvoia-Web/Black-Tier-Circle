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

const WRITE_CONTROL_PARAMS = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

/**
 * A write is filtered when the URL carries a row predicate.
 * PostgREST puts those on the query string. select, order, and on_conflict do not count.
 */
export function urlHasRowFilter(url: URL): boolean {
  for (const key of url.searchParams.keys()) {
    if (!WRITE_CONTROL_PARAMS.has(key)) {
      return true;
    }
  }
  return false;
}

export const UNFILTERED_WRITE = 'Refusing a write with no filter.';

type FlexibleBuilder = QueryBuilder<unknown> & {
  neq: (column: string, value: string | number | boolean) => FlexibleBuilder;
  gt: (column: string, value: string | number) => FlexibleBuilder;
  lt: (column: string, value: string | number) => FlexibleBuilder;
  match: (query: Record<string, unknown>) => FlexibleBuilder;
  filter: (column: string, operator: string, value: string) => FlexibleBuilder;
  not: (column: string, operator: string, value: unknown) => FlexibleBuilder;
  upsert: (values: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>, options?: Record<string, unknown>) => FlexibleBuilder;
  url?: URL;
};

/**
 * Refuses the request when the write builder is executed with no row filter.
 * Filters chained after update(), delete(), or upsert() still land on the URL first.
 */
export function guardUnfilteredWrite<T extends object>(builder: T): T {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === 'then') {
        const then = value as (onFulfilled?: unknown, onRejected?: unknown) => Promise<unknown>;
        return (onFulfilled?: unknown, onRejected?: unknown) => {
          const url = (target as { url?: URL }).url;
          if (!(url instanceof URL) || !urlHasRowFilter(url)) {
            return Promise.reject(new Error(UNFILTERED_WRITE)).then(onFulfilled as () => never, onRejected as () => never);
          }
          return then.call(target, onFulfilled, onRejected);
        };
      }
      if (typeof value !== 'function') {
        return value;
      }
      return (...args: unknown[]) => {
        if (prop === 'maybeSingle' || prop === 'single' || prop === 'csv') {
          const url = (target as { url?: URL }).url;
          if (!(url instanceof URL) || !urlHasRowFilter(url)) {
            return Promise.reject(new Error(UNFILTERED_WRITE));
          }
        }
        const result = value.apply(target, args);
        if (result === target) {
          return receiver;
        }
        return result;
      };
    },
  });
}

function applyHeld(query: FlexibleBuilder, filters: Array<(query: FlexibleBuilder) => FlexibleBuilder>): FlexibleBuilder {
  let next = query;
  for (const apply of filters) {
    next = apply(next);
  }
  return next;
}

/**
 * The live client can filter only after select(), update(), delete(), or upsert().
 * The in-memory test client can filter first, so it is returned unchanged.
 * This wrapper remembers filters set first and applies them to every read and write.
 * A write that is executed with no row filter is refused before any request is sent.
 */
export function fromWithEarlyFilters(client: { from: (relation: string) => QueryBuilder<unknown> }): DbClient['from'] {
  return (relation) => {
    const raw = client.from(relation) as FlexibleBuilder;
    if (typeof raw.eq === 'function') {
      return raw;
    }
    const filters: Array<(query: FlexibleBuilder) => FlexibleBuilder> = [];
    let ordering: { column: string; options?: { ascending?: boolean } } | null = null;
    let limitCount: number | null = null;
    let rangeArgs: [number, number] | null = null;
    const finishRead = (query: FlexibleBuilder): FlexibleBuilder => {
      let next = applyHeld(query, filters);
      if (ordering) next = next.order(ordering.column, ordering.options) as FlexibleBuilder;
      if (limitCount !== null) next = next.limit(limitCount) as FlexibleBuilder;
      if (rangeArgs) next = next.range(rangeArgs[0], rangeArgs[1]) as FlexibleBuilder;
      return next;
    };
    const chain = {
      select(columns?: string, options?: { count?: 'exact'; head?: boolean }) {
        return finishRead(raw.select(columns, options) as FlexibleBuilder);
      },
      insert: (values: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>) => raw.insert(values),
      update(values: Record<string, unknown>) {
        return guardUnfilteredWrite(applyHeld(raw.update(values) as FlexibleBuilder, filters));
      },
      delete() {
        return guardUnfilteredWrite(applyHeld(raw.delete() as FlexibleBuilder, filters));
      },
      upsert(values: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>, options?: Record<string, unknown>) {
        return guardUnfilteredWrite(applyHeld(raw.upsert(values, options) as FlexibleBuilder, filters));
      },
      eq(column: string, value: string | number | boolean) {
        filters.push((query) => query.eq(column, value) as FlexibleBuilder);
        return chain;
      },
      neq(column: string, value: string | number | boolean) {
        filters.push((query) => query.neq(column, value));
        return chain;
      },
      gt(column: string, value: string | number) {
        filters.push((query) => query.gt(column, value));
        return chain;
      },
      lt(column: string, value: string | number) {
        filters.push((query) => query.lt(column, value));
        return chain;
      },
      in(column: string, values: ReadonlyArray<string>) {
        filters.push((query) => query.in(column, values) as FlexibleBuilder);
        return chain;
      },
      is(column: string, value: null) {
        filters.push((query) => query.is(column, value) as FlexibleBuilder);
        return chain;
      },
      gte(column: string, value: string) {
        filters.push((query) => query.gte(column, value) as FlexibleBuilder);
        return chain;
      },
      lte(column: string, value: string) {
        filters.push((query) => query.lte(column, value) as FlexibleBuilder);
        return chain;
      },
      ilike(column: string, pattern: string) {
        filters.push((query) => query.ilike(column, pattern) as FlexibleBuilder);
        return chain;
      },
      match(query: Record<string, unknown>) {
        filters.push((builder) => builder.match(query));
        return chain;
      },
      filter(column: string, operator: string, value: string) {
        filters.push((builder) => builder.filter(column, operator, value));
        return chain;
      },
      not(column: string, operator: string, value: unknown) {
        filters.push((builder) => builder.not(column, operator, value));
        return chain;
      },
      or(expression: string) {
        filters.push((query) => query.or(expression) as FlexibleBuilder);
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
