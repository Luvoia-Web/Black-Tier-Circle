/**
 * @file tests/fixtures/fake-supabase.ts
 *
 * In-memory Supabase query-builder mock for unit tests.
 *
 * @module Tests
 */

import type { DbClient, QueryBuilder, QueryResult } from '@/lib/supabase/query';

export type MemoryRow = Record<string, unknown>;

type Filter = {
  readonly column: string;
  readonly value: string | null;
};

/**
 * Creates a DbClient backed by in-memory tables.
 *
 * @param initial - Optional seed rows keyed by table name
 */
export function createMemoryDb(initial: Record<string, MemoryRow[]> = {}): DbClient & {
  readonly tables: Record<string, MemoryRow[]>;
} {
  const tables: Record<string, MemoryRow[]> = {
    profiles: [],
    tenants: [],
    invitations: [],
    ...Object.fromEntries(
      Object.entries(initial).map(([key, rows]) => [key, rows.map((row) => ({ ...row }))]),
    ),
  };

  function from(relation: string): QueryBuilder<unknown> {
    const existing = tables[relation];
    const table = existing ?? [];
    tables[relation] = table;
    let mode: 'select' | 'insert' | 'update' = 'select';
    const filters: Filter[] = [];
    let pendingInsert: MemoryRow | null = null;
    let pendingUpdate: MemoryRow | null = null;
    let orderColumn: string | null = null;
    let ascending = true;

    function matches(row: MemoryRow): boolean {
      return filters.every((filter) => {
        if (filter.value === null) {
          return row[filter.column] === null || row[filter.column] === undefined;
        }
        return String(row[filter.column]) === filter.value;
      });
    }

    function apply(): MemoryRow[] {
      if (mode === 'insert' && pendingInsert !== null) {
        const now = new Date().toISOString();
        const row: MemoryRow = {
          created_at: now,
          updated_at: now,
          ...pendingInsert,
          id: pendingInsert.id ?? crypto.randomUUID(),
        };
        table.push(row);
        pendingInsert = null;
        return [row];
      }
      if (mode === 'update' && pendingUpdate !== null) {
        const updated: MemoryRow[] = [];
        for (let index = 0; index < table.length; index += 1) {
          const current = table[index];
          if (current && matches(current)) {
            const next = { ...current, ...pendingUpdate };
            table[index] = next;
            updated.push(next);
          }
        }
        return updated;
      }
      const rows = table.filter(matches);
      if (orderColumn) {
        const column = orderColumn;
        rows.sort((left, right) => {
          const av = String(left[column] ?? '');
          const bv = String(right[column] ?? '');
          return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      }
      return rows;
    }

    const builder: QueryBuilder<unknown> = {
      select(): QueryBuilder<unknown> {
        return builder;
      },
      insert(values): QueryBuilder<unknown> {
        mode = 'insert';
        pendingInsert = Array.isArray(values) ? (values[0] ?? {}) : values;
        return builder;
      },
      update(values): QueryBuilder<unknown> {
        mode = 'update';
        pendingUpdate = values;
        return builder;
      },
      eq(column, value): QueryBuilder<unknown> {
        filters.push({ column, value });
        return builder;
      },
      is(column, value): QueryBuilder<unknown> {
        filters.push({ column, value });
        return builder;
      },
      order(column, options): QueryBuilder<unknown> {
        orderColumn = column;
        ascending = options?.ascending !== false;
        return builder;
      },
      async maybeSingle(): Promise<QueryResult<unknown | null>> {
        const rows = apply();
        return { data: rows[0] ?? null, error: null };
      },
      async single(): Promise<QueryResult<unknown>> {
        const rows = apply();
        const row = rows[0];
        if (!row) {
          return { data: null as unknown, error: { message: 'not found' } };
        }
        return { data: row, error: null };
      },
      then(onfulfilled, onrejected) {
        return Promise.resolve({ data: apply(), error: null }).then(onfulfilled, onrejected);
      },
    };
    return builder;
  }

  return { from, tables };
}
