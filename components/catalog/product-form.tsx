/**
 * @file components/catalog/product-form.tsx
 *
 * Shared create/edit product form. Price inputs are USDT decimals; conversion
 * to minor units happens on submit.
 *
 * @module Components
 */

'use client';

import { type FormEvent, useMemo, useState } from 'react';
import { formatUsdt, usdtToMinor } from '@/lib/money';
import { getMarginMinor, getMarginPercent } from '@/modules/pricing';
import type { DeliveryType } from '@/modules/catalog/types';

export type ProductFormValues = {
  readonly sku: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly deliveryType: DeliveryType;
  readonly wholesaleUsdt: string;
  readonly retailUsdt: string;
  readonly stockUnlimited: boolean;
  readonly stockCount: string;
  readonly resellerEligible: boolean;
  readonly maxPurchaseQty: string;
  readonly estimatedDeliveryMinutes: string;
  readonly supplierSku: string;
  readonly supplierMetadata: string;
};

type ProductFormProps = {
  readonly mode: 'create' | 'edit';
  readonly initial?: ProductFormValues;
  readonly error?: string | null;
  readonly submitting?: boolean;
  readonly onSubmit: (values: ProductFormValues) => Promise<void>;
};

const DELIVERY_OPTIONS: ReadonlyArray<{ value: DeliveryType; label: string }> = [
  { value: 'file_reusable', label: 'Reusable file' },
  { value: 'inventory_unit', label: 'Inventory unit' },
  { value: 'manual', label: 'Manual delivery' },
  { value: 'supplier_api', label: 'Supplier API' },
];

const EMPTY: ProductFormValues = {
  sku: '',
  title: '',
  description: '',
  category: '',
  deliveryType: 'file_reusable',
  wholesaleUsdt: '',
  retailUsdt: '',
  stockUnlimited: true,
  stockCount: '',
  resellerEligible: true,
  maxPurchaseQty: '1',
  estimatedDeliveryMinutes: '',
  supplierSku: '',
  supplierMetadata: '',
};

const inputClass =
  'rounded-md border border-gray-800 bg-gray-900 px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500';

/**
 * Owner product create/edit form with a live reseller margin calculator.
 */
export function ProductForm({
  mode,
  initial,
  error,
  submitting,
  onSubmit,
}: ProductFormProps): JSX.Element {
  const [values, setValues] = useState<ProductFormValues>(initial ?? EMPTY);

  const marginCopy = useMemo(() => {
    try {
      const wholesale = usdtToMinor(values.wholesaleUsdt || '0');
      const retail = usdtToMinor(values.retailUsdt || '0');
      if (wholesale <= 0n || retail <= 0n || retail < wholesale) {
        return null;
      }
      const minor = getMarginMinor(wholesale, retail);
      const percent = getMarginPercent(wholesale, retail);
      return `Resellers earn ${formatUsdt(minor)} (${percent.toFixed(2)}%) margin`;
    } catch {
      return null;
    }
  }, [values.wholesaleUsdt, values.retailUsdt]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await onSubmit(values);
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="max-w-2xl space-y-4">
      <label className="flex flex-col gap-1 text-sm text-gray-400">
        SKU
        <input
          required
          readOnly={mode === 'edit'}
          value={values.sku}
          onChange={(event) => setValues({ ...values, sku: event.target.value.toUpperCase() })}
          className={`${inputClass} ${mode === 'edit' ? 'opacity-70' : ''}`}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-400">
        Title
        <input
          required
          minLength={2}
          maxLength={100}
          value={values.title}
          onChange={(event) => setValues({ ...values, title: event.target.value })}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-400">
        Description
        <textarea
          maxLength={2000}
          rows={4}
          value={values.description}
          onChange={(event) => setValues({ ...values, description: event.target.value })}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-400">
        Category
        <input
          maxLength={50}
          value={values.category}
          onChange={(event) => setValues({ ...values, category: event.target.value })}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-400">
        Delivery type
        <select
          value={values.deliveryType}
          onChange={(event) =>
            setValues({ ...values, deliveryType: event.target.value as DeliveryType })
          }
          className={inputClass}
        >
          {DELIVERY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {values.deliveryType === 'supplier_api' ? (
        <>
          <label className="flex flex-col gap-1 text-sm text-gray-400">
            Supplier SKU
            <input
              required
              maxLength={120}
              value={values.supplierSku}
              onChange={(event) => setValues({ ...values, supplierSku: event.target.value })}
              className={inputClass}
            />
            <span className="text-xs text-gray-500">Product identifier as known to the external supplier</span>
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-400">
            Supplier metadata (optional JSON)
            <textarea
              rows={4}
              value={values.supplierMetadata}
              onChange={(event) => setValues({ ...values, supplierMetadata: event.target.value })}
              className={inputClass}
              placeholder='{"category":"digital"}'
            />
          </label>
        </>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-gray-400">
          Wholesale price
          <input
            required
            inputMode="decimal"
            value={values.wholesaleUsdt}
            onChange={(event) => setValues({ ...values, wholesaleUsdt: event.target.value })}
            className={inputClass}
          />
          <span className="text-xs text-gray-500">Enter in USDT (e.g. 10.50)</span>
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-400">
          Retail price
          <input
            required
            inputMode="decimal"
            value={values.retailUsdt}
            onChange={(event) => setValues({ ...values, retailUsdt: event.target.value })}
            className={inputClass}
          />
          <span className="text-xs text-gray-500">Enter in USDT (e.g. 10.50)</span>
        </label>
      </div>
      {marginCopy ? <p className="text-sm text-emerald-400">{marginCopy}</p> : null}
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={values.stockUnlimited}
          onChange={(event) => setValues({ ...values, stockUnlimited: event.target.checked })}
        />
        Unlimited stock
      </label>
      {values.stockUnlimited ? null : (
        <label className="flex flex-col gap-1 text-sm text-gray-400">
          Stock count
          <input
            required
            type="number"
            min={1}
            value={values.stockCount}
            onChange={(event) => setValues({ ...values, stockCount: event.target.value })}
            className={inputClass}
          />
        </label>
      )}
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={values.resellerEligible}
          onChange={(event) => setValues({ ...values, resellerEligible: event.target.checked })}
        />
        Reseller eligible
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-400">
        Max purchase quantity
        <input
          type="number"
          min={1}
          max={100}
          value={values.maxPurchaseQty}
          onChange={(event) => setValues({ ...values, maxPurchaseQty: event.target.value })}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-400">
        Estimated delivery (minutes)
        <input
          type="number"
          min={1}
          value={values.estimatedDeliveryMinutes}
          onChange={(event) => setValues({ ...values, estimatedDeliveryMinutes: event.target.value })}
          className={inputClass}
        />
      </label>
      {error ? (
        <p className="rounded-md border border-red-600/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
      >
        {submitting ? 'Saving…' : mode === 'create' ? 'Create product' : 'Save changes'}
      </button>
    </form>
  );
}
