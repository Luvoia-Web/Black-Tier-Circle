/**
 * @file components/ui/Table.tsx
 *
 * Primitive table wrapper, header, row, and cell for dense dashboards.
 *
 * @module Components
 */

import type {
  HTMLAttributes,
  ReactNode,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from 'react';

type TableProps = {
  readonly children: ReactNode;
  readonly className?: string;
};

/**
 * Scrollable card wrapper around a native table.
 *
 * @param props - Table children and optional class
 */
export function Table({ children, className = '' }: TableProps): JSX.Element {
  return (
    <div
      className={`overflow-x-auto rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] ${className}`}
    >
      <table className="min-w-full text-left">{children}</table>
    </div>
  );
}

/**
 * Table header cell.
 *
 * @param props - Native th props
 */
export function Th({ children, className = '', ...rest }: ThHTMLAttributes<HTMLTableCellElement>): JSX.Element {
  return (
    <th
      {...rest}
      className={`border-b border-[var(--border)] bg-[var(--bg-page)] px-4 py-3 text-xs font-medium text-[var(--text-2)] ${className}`}
    >
      {children}
    </th>
  );
}

/**
 * Table body row with hover highlight.
 *
 * @param props - Native tr props
 */
export function Tr({ children, className = '', ...rest }: HTMLAttributes<HTMLTableRowElement>): JSX.Element {
  return (
    <tr
      {...rest}
      className={`border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-raised)] ${className}`}
    >
      {children}
    </tr>
  );
}

/**
 * Table body cell.
 *
 * @param props - Native td props
 */
export function Td({ children, className = '', ...rest }: TdHTMLAttributes<HTMLTableCellElement>): JSX.Element {
  return (
    <td {...rest} className={`px-4 py-3 text-sm text-[var(--text-1)] ${className}`}>
      {children}
    </td>
  );
}

export default Table;
