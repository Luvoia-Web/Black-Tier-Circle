/**
 * @file app/(dashboard)/owner/products/new/page.tsx
 *
 * Create-product form. Submits as a draft then redirects to the detail page.
 *
 * @module Dashboard
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProductForm, type ProductFormValues } from '@/components/catalog/product-form';
import { PageHeader } from '@/components/ui/page-header';
import { usdtToMinor } from '@/lib/money';
import { API_ROUTES, ROUTES } from '@/lib/navigation';

function parseSupplierMetadata(raw: string): Record<string, unknown> | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const parsed: unknown = JSON.parse(trimmed);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Supplier metadata must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

/**
 * Owner create-product page.
 */
export default function NewProductPage(): JSX.Element {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(values: ProductFormValues): Promise<void> {
    setError(null);
    setSubmitting(true);
    try {
      const wholesalePriceMinor = usdtToMinor(values.wholesaleUsdt);
      const retailPriceMinor = usdtToMinor(values.retailUsdt);
      const response = await fetch(API_ROUTES.products, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: values.sku,
          title: values.title,
          description: values.description || undefined,
          category: values.category || undefined,
          deliveryType: values.deliveryType,
          wholesalePriceStr: wholesalePriceMinor.toString(),
          retailPriceStr: retailPriceMinor.toString(),
          stockUnlimited: values.stockUnlimited,
          stockCount: values.stockUnlimited ? undefined : Number(values.stockCount),
          resellerEligible: values.resellerEligible,
          maxPurchaseQty: Number(values.maxPurchaseQty),
          estimatedDeliveryMinutes: values.estimatedDeliveryMinutes
            ? Number(values.estimatedDeliveryMinutes)
            : undefined,
          supplierSku: values.deliveryType === 'supplier_api' ? values.supplierSku : undefined,
          supplierMetadata:
            values.deliveryType === 'supplier_api' ? parseSupplierMetadata(values.supplierMetadata) : undefined,
        }),
      });
      const json = (await response.json()) as {
        success: boolean;
        data?: { id: string };
        error?: { message: string };
      };
      if (!json.success || !json.data) {
        setError(json.error?.message ?? 'Unable to create product');
        return;
      }
      router.push(ROUTES.owner.productDetail(json.data.id));
    } catch {
      setError('Unable to create product');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader title="Add product" description="Create a draft product. Files can be uploaded after saving." />
      <ProductForm mode="create" error={error} submitting={submitting} onSubmit={onSubmit} />
    </>
  );
}
