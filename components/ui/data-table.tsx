/**
 * @file components/ui/data-table.tsx
 *
 * Simple table with headers, rows, and an empty state.
 *
 * @module Components
 */

import type { ReactNode } from 'react';

export type DataTableColumn<T> = {
  readonly key: string;
  readonly header: string;
  readonly render: (row: T) => ReactNode;
};

type DataTableProps<T> = {
  readonly columns: ReadonlyArray<DataTableColumn<T>>;
  readonly rows: ReadonlyArray<T>;
  readonly emptyMessage: string;
  readonly rowKey: (row: T) => string;
};

/**
 * Renders a token-styled data table or the provided empty message.
 *
 * @param props - Columns, rows, and empty copy
 */
export function DataTable<T>({ columns, rows, emptyMessage, rowKey }: DataTableProps<T>): JSX.Element {
  if (rows.length === 0) {
    return (
      <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-12 text-center text-sm text-[var(--text-2)]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)]">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className="border-b border-[var(--border)] bg-[var(--bg-page)] px-4 py-3 text-xs font-medium text-[var(--text-2)]"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-raised)]"
            >
              {columns.map((column) => (
                <td key={column.key} className="px-4 py-3 text-sm text-[var(--text-1)]">
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
