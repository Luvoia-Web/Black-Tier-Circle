/**
 * @file components/platform/ui/table.tsx
 *
 * Dense table. Numerals are mono and right aligned. The header sticks.
 * A selection pins a bulk bar. Glass is not used here.
 */

import type { ReactNode } from 'react';
import { EmptyState, ErrorState, Skeleton } from '@/components/platform/ui/feedback';

export type Column<T> = {
  readonly id: string;
  readonly header: string;
  readonly numeric?: boolean;
  readonly sortable?: boolean;
  readonly render: (row: T) => ReactNode;
};

type Sort = {
  readonly id: string;
  readonly direction: 'asc' | 'desc';
};

type DataTableProps<T> = {
  readonly columns: readonly Column<T>[];
  readonly rows: readonly T[];
  readonly rowKey: (row: T) => string;
  readonly caption: string;
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly onRetry?: () => void;
  readonly emptyTitle?: string;
  readonly emptyMessage?: string;
  readonly emptyAction?: ReactNode;
  readonly sort?: Sort | null;
  readonly onSort?: (id: string) => void;
  readonly selected?: ReadonlySet<string>;
  readonly onSelected?: (next: ReadonlySet<string>) => void;
  readonly onOpen?: (row: T) => void;
  readonly bulk?: ReactNode;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  loading = false,
  error = null,
  onRetry,
  emptyTitle = 'Nothing here',
  emptyMessage = 'Try a different filter, or add the first record.',
  emptyAction,
  sort = null,
  onSort,
  selected,
  onSelected,
  onOpen,
  bulk,
}: DataTableProps<T>): JSX.Element {
  if (loading) {
    return (
      <div aria-busy="true" className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }
  if (error) {
    return <ErrorState message={error} {...(onRetry ? { onRetry } : {})} />;
  }
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} message={emptyMessage} {...(emptyAction ? { action: emptyAction } : {})} />;
  }

  const keys = rows.map(rowKey);
  const allSelected = selected ? keys.every((key) => selected.has(key)) : false;

  function toggleAll(): void {
    if (!onSelected || !selected) {
      return;
    }
    onSelected(allSelected ? new Set() : new Set(keys));
  }

  function toggleOne(key: string): void {
    if (!onSelected || !selected) {
      return;
    }
    const next = new Set(selected);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onSelected(next);
  }

  return (
    <div className="surface-table relative max-w-full overflow-x-auto rounded-lg">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-plane">
          <tr className="border-b border-stroke">
            {onSelected ? (
              <th className="w-10 px-2 py-2">
                <input type="checkbox" aria-label="Select every row on this page" checked={allSelected} onChange={toggleAll} />
              </th>
            ) : null}
            {columns.map((column) => {
              const active = sort?.id === column.id;
              const label = active ? `${column.header}, ${sort?.direction === 'asc' ? 'ascending' : 'descending'}` : column.header;
              return (
                <th key={column.id} scope="col" className={`px-2 py-2 text-xs font-medium uppercase tracking-[0.08em] text-ink-faint ${column.numeric ? 'text-right' : 'text-left'}`}>
                  {column.sortable && onSort ? (
                    <button type="button" className="min-h-11 text-ink-faint" aria-label={label} onClick={() => onSort(column.id)}>
                      {column.header}
                    </button>
                  ) : column.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            return (
              <tr key={key} className="border-b border-stroke hover:bg-raised">
                {onSelected && selected ? (
                  <td className="px-2 py-1">
                    <input type="checkbox" aria-label={`Select ${key}`} checked={selected.has(key)} onChange={() => toggleOne(key)} />
                  </td>
                ) : null}
                {columns.map((column) => (
                  <td key={column.id} className={`px-2 py-2 text-ink ${column.numeric ? 'text-right font-num' : 'text-left'}`}>
                    {onOpen && column.id === columns[0]?.id ? (
                      <button type="button" className="min-h-11 text-left text-ink underline-offset-2 hover:underline" onClick={() => onOpen(row)}>
                        {column.render(row)}
                      </button>
                    ) : column.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {selected && selected.size > 0 && bulk ? (
        <div className="sticky bottom-0 mt-2 flex flex-wrap items-center gap-2 rounded-md border border-stroke bg-raised px-3 py-2">
          <p className="font-num text-sm text-ink">{selected.size} selected</p>
          {bulk}
        </div>
      ) : null}
    </div>
  );
}
