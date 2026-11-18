/**
 * Search ids. Each column is its own ilike parameter. The caller passes the
 * ids to in(). User text never becomes part of an or() filter string.
 */

import { AppError } from '@/lib/errors';
import type { DbClient, QueryBuilder, QueryResult } from '@/lib/supabase/query';

const NONE = '00000000-0000-0000-0000-000000000000';

function idsOf(result: QueryResult<unknown>): string[] {
  if (result.error) {
    throw new AppError('SEARCH_FAILED', result.error.message, 500);
  }
  if (!Array.isArray(result.data)) return [];
  return result.data.flatMap((row) => {
    if (typeof row !== 'object' || row === null || !('id' in row)) return [];
    const id = (row as { id: unknown }).id;
    return typeof id === 'string' && id ? [id] : [];
  });
}

export async function idsMatching(db: DbClient, table: string, columns: readonly string[], term: string, limit = 200): Promise<string[]> {
  const like = `%${term}%`;
  const ids = new Set<string>();
  for (const column of columns) {
    for (const id of idsOf((await db.from(table).select('id').ilike(column, like).limit(limit)) as QueryResult<unknown>)) {
      ids.add(id);
    }
  }
  return [...ids];
}

export function limitToIds<T>(query: QueryBuilder<T>, ids: readonly string[]): QueryBuilder<T> {
  if (ids.length === 0) return query.eq('id', NONE);
  return query.in('id', [...ids]);
}
