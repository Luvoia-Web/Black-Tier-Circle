/**
 * @file components/platform/ui/chrome.tsx
 *
 * Filter row, pagination, and overlays on the raised layer.
 */

'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/platform/ui/button';

export function FilterBar({ children }: { readonly children: ReactNode }): JSX.Element {
  return <div className="flex flex-wrap items-end gap-2">{children}</div>;
}

type PaginationProps = {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly onPage: (page: number) => void;
  readonly onPageSize?: (size: number) => void;
};

export function Pagination({ page, pageSize, total, onPage, onPageSize }: PaginationProps): JSX.Element {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const current = Math.min(page, pages);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-soft">
      <p className="font-num">{total} total</p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" disabled={current <= 1} onClick={() => onPage(current - 1)}>Previous</Button>
        <span className="font-num text-ink">Page {current} of {pages}</span>
        <Button variant="secondary" disabled={current >= pages} onClick={() => onPage(current + 1)}>Next</Button>
      </div>
      {onPageSize ? (
        <label className="flex items-center gap-2 text-xs text-ink-faint">
          Page size
          <select
            className="min-h-11 rounded-md border border-stroke bg-raised px-2 text-sm text-ink"
            value={pageSize}
            onChange={(event) => onPageSize(Number(event.target.value))}
          >
            {[24, 48, 96].map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}

type ModalProps = {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly wide?: boolean;
};

export function Modal({ open, title, onClose, children, wide = false }: ModalProps): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.querySelector<HTMLElement>('button, input, select, textarea')?.focus();
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) {
        return;
      }
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('button, input, select, textarea, a')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener.current?.focus();
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-4 py-6 sm:items-center">
      <button type="button" aria-label="Close dialog" className="absolute inset-0 bg-[color-mix(in_srgb,var(--base)_62%,transparent)]" onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`relative z-10 max-h-[85vh] w-full overflow-y-auto rounded-lg border border-stroke bg-raised p-4 ${wide ? 'max-w-3xl' : 'max-w-lg'}`}>
        <h2 id={titleId} className="text-base text-ink">{title}</h2>
        <div className="mt-3 text-sm text-ink-soft">{children}</div>
      </div>
    </div>
  );
}

type PopoverProps = {
  readonly label: string;
  readonly children: ReactNode;
};

export function Popover({ label, children }: PopoverProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    function onPointer(event: MouseEvent): void {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <Button variant="secondary" aria-expanded={open} onClick={() => setOpen((current) => !current)}>{label}</Button>
      {open ? <div className="absolute right-0 z-30 mt-1 min-w-48 rounded-md border border-stroke bg-raised p-3 text-sm text-ink">{children}</div> : null}
    </div>
  );
}

type TooltipProps = {
  readonly label: string;
  readonly children: ReactNode;
};

export function Tooltip({ label, children }: TooltipProps): JSX.Element {
  const id = useId();
  return (
    <span className="relative inline-flex">
      <button type="button" aria-describedby={id} className="peer min-h-11 text-sm text-ink-soft underline-offset-2 hover:underline">
        {children}
      </button>
      <span id={id} role="tooltip" className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden w-56 rounded-md border border-stroke bg-raised px-2 py-1 text-xs text-ink peer-hover:block peer-focus-visible:block">
        {label}
      </span>
    </span>
  );
}

export function OverlayDrawer({ open, title, onClose, children }: ModalProps): JSX.Element | null {
  const panelRef = useRef<HTMLElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    panelRef.current?.querySelector<HTMLElement>('button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) {
    return null;
  }
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label="Close panel" className="absolute inset-0 bg-[color-mix(in_srgb,var(--base)_55%,transparent)]" onClick={onClose} />
      <aside ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-stroke bg-raised">
        <header className="flex items-center justify-between border-b border-stroke px-4 py-3">
          <h2 id={titleId} className="text-sm text-ink">{title}</h2>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4 text-sm text-ink-soft">{children}</div>
      </aside>
    </div>
  );
}

type Notice = {
  readonly message: string;
  readonly tone?: 'ok' | 'fault';
};

export function notify(notice: Notice): void {
  const options = { description: undefined };
  if (notice.tone === 'fault') {
    toast.error(notice.message, options);
    return;
  }
  toast.success(notice.message, options);
}
