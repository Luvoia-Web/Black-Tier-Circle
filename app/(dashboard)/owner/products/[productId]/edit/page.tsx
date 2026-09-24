/**
 * @file app/(dashboard)/owner/products/[productId]/edit/page.tsx
 *
 * Edit product form — same fields as create, SKU read-only.
 *
 * @module Dashboard
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProductForm, type ProductFormValues } from '@/components/catalog/product-form';
import { PageHeader } from '@/components/ui/page-header';
import { minorToUsdt, usdtToMinor } from '@/lib/money';
import { API_ROUTES, ROUTES } from '@/lib/navigation';
import type { DeliveryType } from '@/modules/catalog/types';

function parseSupplierMetadata(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed: unknown = JSON.parse(trimmed);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Supplier metadata must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

type EditPageProps = {
  readonly params: { readonly productId: string };
};

type ProductDto = {
  readonly id: string;
  readonly sku: string;
  readonly title: string;
  readonly description: string | null;
  readonly category: string | null;
  readonly deliveryType: DeliveryType;
  readonly wholesalePriceMinor: string;
  readonly retailPriceMinor: string;
  readonly stockUnlimited: boolean;
  readonly stockCount: number | null;
  readonly resellerEligible: boolean;
  readonly maxPurchaseQty: number;
  readonly estimatedDeliveryMinutes: number | null;
  readonly supplierSku: string | null;
  readonly supplierId: string | null;
  readonly supplierName: string | null;
  readonly supplierMetadata: Record<string, unknown>;
};

function trimUsdt(minor: string): string {
  const full = minorToUsdt(BigInt(minor));
  return full.replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Owner edit-product page.
 */
export default function EditProductPage({ params }: EditPageProps): JSX.Element {
  const router = useRouter();
  const [initial, setInitial] = useState<ProductFormValues | null>(null);
  const [supplierLocked, setSupplierLocked] = useState<{ name: string; sku: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void (async () => {
      const response = await fetch(API_ROUTES.product(params.productId));
      const json = (await response.json()) as {
        success: boolean;
        data?: ProductDto;
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to load product');
        return;
      }
      const product = json.data;
      if (product.supplierId) {
        setSupplierLocked({
          name: product.supplierName ?? 'the supplier',
          sku: product.supplierSku ?? '',
        });
      }
      setInitial({
        sku: product.sku,
        title: product.title,
        description: product.description ?? '',
        category: product.category ?? '',
        deliveryType: product.deliveryType,
        wholesaleUsdt: trimUsdt(product.wholesalePriceMinor),
        retailUsdt: trimUsdt(product.retailPriceMinor),
        stockUnlimited: product.stockUnlimited,
        stockCount: product.stockCount === null ? '' : String(product.stockCount),
        resellerEligible: product.resellerEligible,
        maxPurchaseQty: String(product.maxPurchaseQty),
        estimatedDeliveryMinutes:
          product.estimatedDeliveryMinutes === null ? '' : String(product.estimatedDeliveryMinutes),
        supplierSku: product.supplierSku ?? '',
        supplierMetadata:
          product.supplierMetadata && Object.keys(product.supplierMetadata).length > 0
            ? JSON.stringify(product.supplierMetadata, null, 2)
            : '',
      });
    })();
  }, [params.productId]);

  async function onSubmit(values: ProductFormValues): Promise<void> {
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(API_ROUTES.product(params.productId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: values.title,
          description: values.description || null,
          category: values.category || null,
          deliveryType: supplierLocked ? 'supplier_api' : values.deliveryType,
          wholesalePriceStr: usdtToMinor(values.wholesaleUsdt).toString(),
          retailPriceStr: usdtToMinor(values.retailUsdt).toString(),
          stockUnlimited: values.stockUnlimited,
          stockCount: values.stockUnlimited ? null : Number(values.stockCount),
          resellerEligible: values.resellerEligible,
          maxPurchaseQty: Number(values.maxPurchaseQty),
          estimatedDeliveryMinutes: values.estimatedDeliveryMinutes
            ? Number(values.estimatedDeliveryMinutes)
            : null,
          supplierSku: values.deliveryType === 'supplier_api' ? values.supplierSku : null,
          supplierMetadata:
            values.deliveryType === 'supplier_api' ? parseSupplierMetadata(values.supplierMetadata) : {},
        }),
      });
      const json = (await response.json()) as { success: boolean; error?: { message: string } };
      if (!json.success) {
        setError(json.error?.message ?? 'Unable to save product');
        return;
      }
      router.push(ROUTES.owner.productDetail(params.productId));
    } catch {
      setError('Unable to save product');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader title="Edit product" description="SKU cannot be changed after creation." />
      {initial ? (
        <ProductForm
          mode="edit"
          initial={initial}
          supplierLocked={supplierLocked}
          error={error}
          submitting={submitting}
          onSubmit={onSubmit}
        />
      ) : (
        <p className="text-sm text-[var(--text-2)]">{error ?? 'Loading…'}</p>
      )}
    </>
  );
}
