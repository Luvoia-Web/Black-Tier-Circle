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
 * Renders a dark-theme data table or the provided empty message.
 *
 * @param props - Columns, rows, and empty copy
 */
export function DataTable<T>({ columns, rows, emptyMessage, rowKey }: DataTableProps<T>): JSX.Element {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 px-6 py-12 text-center text-sm text-gray-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-800">
      <table className="min-w-full divide-y divide-gray-800 text-left text-sm">
        <thead className="bg-gray-900">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="px-4 py-3 font-medium text-gray-400">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800 bg-gray-950">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-gray-900/80">
              {columns.map((column) => (
                <td key={column.key} className="px-4 py-3 text-gray-100">
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
