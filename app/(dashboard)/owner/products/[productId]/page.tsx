/**
 * @file app/(dashboard)/owner/products/[productId]/page.tsx
 *
 * Product detail: metadata, file management, and status controls.
 *
 * @module Dashboard
 */

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ProductStatusBadge } from '@/components/catalog/product-status-badge';
import { PageHeader } from '@/components/ui/page-header';
import { formatUsdt } from '@/lib/money';
import { productTypeLabel, productTypeTone } from '@/lib/product-labels';
import { API_ROUTES, ROUTES } from '@/lib/navigation';
import type { ProductStatus } from '@/modules/catalog/types';

type AssetDto = {
  readonly id: string;
  readonly productId: string;
  readonly contentType: string;
  readonly fileSizeBytes: number | null;
  readonly isPreview: boolean;
  readonly version: number;
};

type ProductDto = {
  readonly id: string;
  readonly sku: string;
  readonly title: string;
  readonly description: string | null;
  readonly category: string | null;
  readonly deliveryType: string;
  readonly status: ProductStatus;
  readonly wholesalePriceMinor: string;
  readonly retailPriceMinor: string;
  readonly stockUnlimited: boolean;
  readonly stockCount: number | null;
  readonly resellerEligible: boolean;
  readonly maxPurchaseQty: number;
  readonly estimatedDeliveryMinutes: number | null;
  readonly version: number;
  readonly supplierId: string | null;
  readonly supplierSku: string | null;
  readonly supplierName: string | null;
  readonly assets: AssetDto[];
};

type DetailPageProps = {
  readonly params: { readonly productId: string };
};

function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return 'Unknown size';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Owner product detail page with file upload and status lifecycle actions.
 */
export default function ProductDetailPage({ params }: DetailPageProps): JSX.Element {
  const [product, setProduct] = useState<ProductDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadExpiry, setDownloadExpiry] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(API_ROUTES.product(params.productId));
      const json = (await response.json()) as {
        success: boolean;
        data?: ProductDto;
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to load product');
        setProduct(null);
        return;
      }
      setProduct(json.data);
    } catch {
      setError('Unable to load product');
    } finally {
      setLoading(false);
    }
  }, [params.productId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(status: 'published' | 'paused' | 'archived'): Promise<void> {
    if (status === 'archived' && !window.confirm('Archive this product? This cannot be easily reversed.')) {
      return;
    }
    if (status !== 'archived' && !window.confirm(`Set status to ${status}?`)) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(API_ROUTES.productStatus(params.productId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = (await response.json()) as { success: boolean; error?: { message: string } };
      if (!json.success) {
        setError(json.error?.message ?? 'Unable to update status');
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(file: File, isPreview: boolean): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set('productId', params.productId);
      body.set('file', file);
      body.set('isPreview', isPreview ? 'true' : 'false');
      const response = await fetch(API_ROUTES.productUpload, { method: 'POST', body });
      const json = (await response.json()) as { success: boolean; error?: { message: string } };
      if (!json.success) {
        setError(json.error?.message ?? 'Upload failed');
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function removeAsset(assetId: string): Promise<void> {
    if (!window.confirm('Delete this file?')) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(API_ROUTES.productAsset(params.productId, assetId), {
        method: 'DELETE',
      });
      const json = (await response.json()) as { success: boolean; error?: { message: string } };
      if (!json.success) {
        setError(json.error?.message ?? 'Unable to delete file');
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function generateLink(assetId: string): Promise<void> {
    setBusy(true);
    try {
      const response = await fetch(API_ROUTES.productDownload(params.productId, assetId));
      const json = (await response.json()) as {
        success: boolean;
        data?: { url: string; expiresAt: string };
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to generate download link');
        return;
      }
      setDownloadUrl(json.data.url);
      setDownloadExpiry(json.data.expiresAt);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-[var(--text-2)]">Loading product…</p>;
  }
  if (!product) {
    return <p className="text-sm text-[var(--red)]">{error ?? 'Product not found'}</p>;
  }

  return (
    <>
      <PageHeader
        title={product.title}
        description={product.sku}
        actions={
          <Link
            href={ROUTES.owner.productEdit(product.id)}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            Edit
          </Link>
        }
      />
      {error ? (
        <p className="mb-4 rounded-md border border-[var(--red)]/20 bg-[var(--red-soft)] px-3 py-2 text-sm text-[var(--red)]">
          {error}
        </p>
      ) : null}
      <dl className="mb-8 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase text-[var(--text-3)]">Status</dt>
          <dd className="mt-1">
            <ProductStatusBadge status={product.status} />
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--text-3)]">Category</dt>
          <dd className="mt-1 text-sm text-[var(--text-1)]">{product.category ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--text-3)]">Wholesale</dt>
          <dd className="mt-1 text-sm text-[var(--text-1)]">{formatUsdt(BigInt(product.wholesalePriceMinor))}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--text-3)]">Retail</dt>
          <dd className="mt-1 text-sm text-[var(--text-1)]">{formatUsdt(BigInt(product.retailPriceMinor))}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--text-3)]">Delivery</dt>
          <dd className={`mt-1 text-sm ${productTypeTone(productTypeLabel(product))}`}>{productTypeLabel(product)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-[var(--text-3)]">Stock</dt>
          <dd className="mt-1 text-sm text-[var(--text-1)]">
            {product.stockUnlimited ? 'Unlimited' : String(product.stockCount ?? 0)}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs uppercase text-[var(--text-3)]">Description</dt>
          <dd className="mt-1 text-sm text-[var(--text-1)]">{product.description ?? '—'}</dd>
        </div>
      </dl>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-[var(--text-2)]">Status</h2>
        <div className="flex flex-wrap gap-2">
          {product.status !== 'archived' ? (
            <>
              {product.status !== 'published' ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void changeStatus('published')}
                  className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white hover:bg-[var(--accent-soft)] disabled:opacity-60"
                >
                  Publish
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void changeStatus('paused')}
                  className="rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] px-3 py-1.5 text-sm text-[var(--text-1)] hover:bg-[var(--bg-hover)] disabled:opacity-60"
                >
                  Pause
                </button>
              )}
            </>
          ) : null}
        </div>
      </section>

      {product.supplierId || product.deliveryType === 'supplier_api' ? (
        <section className="mb-8 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-raised)] p-4">
          <p className="text-sm font-medium text-[var(--text-1)]">Supplier product</p>
          <p className="mt-1 text-sm text-[var(--text-2)]">
            This product is fulfilled by <strong>{product.supplierName ?? 'the supplier'}</strong>. Content is delivered
            automatically when a customer purchases — no file upload needed.
          </p>
          <p className="mt-1 text-xs text-[var(--text-3)]">
            Supplier SKU: <code>{product.supplierSku ?? '—'}</code>
          </p>
        </section>
      ) : (
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-[var(--text-2)]">Files</h2>
          <div>
            <input
              ref={fileInput}
              type="file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void uploadFile(file, false);
                  event.target.value = '';
                }
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              className="rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] px-3 py-1.5 text-sm text-[var(--text-1)] hover:bg-[var(--bg-hover)] disabled:opacity-60"
            >
              Upload new file
            </button>
          </div>
        </div>
        {product.assets.length === 0 ? (
          <p className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-6 py-8 text-center text-sm text-[var(--text-2)]">
            No files attached yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {product.assets.map((asset) => (
              <li
                key={asset.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3"
              >
                <div>
                  <p className="text-sm text-[var(--text-1)]">
                    {asset.isPreview ? 'Preview' : 'Delivery'} · {asset.contentType}
                  </p>
                  <p className="text-xs text-[var(--text-3)]">{formatBytes(asset.fileSizeBytes)}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void generateLink(asset.id)}
                    className="text-xs font-medium text-[var(--accent-soft)] hover:text-[var(--accent)]"
                  >
                    Generate Download Link
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void removeAsset(asset.id)}
                    className="text-xs font-medium text-[var(--red)] hover:text-red-300"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {downloadUrl ? (
          <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <p className="text-xs text-[var(--amber)]">
              Signed URL expires at {downloadExpiry ? new Date(downloadExpiry).toLocaleString() : '1 hour'}.
            </p>
            <p className="mt-2 break-all font-mono text-xs text-[var(--text-1)]">{downloadUrl}</p>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(downloadUrl)}
              className="mt-2 rounded-md border border-[var(--border-soft)] bg-[var(--bg-raised)] px-3 py-1.5 text-xs text-[var(--text-1)]"
            >
              Copy link
            </button>
          </div>
        ) : null}
      </section>
      )}

      <section className="rounded-lg border border-red-900/40 bg-red-950/20 p-4">
        <h2 className="text-sm font-medium text-[var(--red)]">Danger zone</h2>
        <p className="mt-1 text-sm text-[var(--text-2)]">Archiving cannot be reversed from the dashboard.</p>
        <button
          type="button"
          disabled={busy || product.status === 'archived'}
          onClick={() => void changeStatus('archived')}
          className="mt-3 rounded-md border border-[var(--red)]/20 bg-red-600/20 px-3 py-1.5 text-sm text-[var(--red)] hover:bg-red-600/30 disabled:opacity-60"
        >
          Archive product
        </button>
      </section>
    </>
  );
}
