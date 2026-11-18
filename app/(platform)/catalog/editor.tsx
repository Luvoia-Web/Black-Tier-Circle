'use client';

/**
 * Full product editor. SKU is editable only while the product is being created.
 * Files, images and tiers use the existing product routes.
 */

import { useState } from 'react';
import { Button, ErrorState, SelectField, Skeleton, TextAreaField, TextField } from '@/components/platform/ui';
import { runAction } from '@/lib/hooks/use-action';
import { useData } from '@/lib/hooks/use-data';
import { usdtToMinor } from '@/lib/money';
import { API_ROUTES } from '@/lib/navigation';

type Asset = {
  readonly id: string;
  readonly contentType: string;
  readonly fileSizeBytes: string | number | null;
  readonly isPreview: boolean;
};

type ProductPayload = {
  readonly id: string;
  readonly sku: string;
  readonly title: string;
  readonly description: string | null;
  readonly category: string | null;
  readonly buyerCategory: string | null;
  readonly deliveryType: string;
  readonly status: string;
  readonly wholesalePriceMinor: string;
  readonly retailPriceMinor: string;
  readonly stockUnlimited: boolean;
  readonly stockCount: number | null;
  readonly durationText: string | null;
  readonly warrantyText: string | null;
  readonly typeLabel: string | null;
  readonly supplierSku: string | null;
  readonly assets?: readonly Asset[];
};

type TierPayload = {
  readonly tiers: readonly { readonly minQty: number; readonly unitPriceMinor: string }[];
};

type TierDraft = { readonly minQty: string; readonly unitPrice: string };

const DELIVERY = [
  { value: 'file_reusable', label: 'File' },
  { value: 'inventory_unit', label: 'Inventory unit' },
  { value: 'manual', label: 'Manual' },
  { value: 'supplier_api', label: 'Supplier' },
];

function usdt(minor: string): string {
  try {
    const value = BigInt(minor);
    const whole = value / 1_000_000n;
    const frac = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
    return frac ? `${whole}.${frac}` : String(whole);
  } catch {
    return '';
  }
}

export function ProductEditor({
  productId,
  listingId,
  role,
  onClose,
  onSaved,
}: {
  readonly productId: string | null;
  readonly listingId: string | null;
  readonly role: 'owner' | 'reseller';
  readonly onClose: () => void;
  readonly onSaved: (id: string | null) => void;
}): JSX.Element {
  if (role === 'reseller') {
    return <ResellerEditor listingId={listingId} productId={productId} onClose={onClose} onSaved={onSaved} />;
  }
  if (!productId) {
    return <OwnerForm product={null} onClose={onClose} onSaved={onSaved} />;
  }
  return <ExistingOwner productId={productId} onClose={onClose} onSaved={onSaved} />;
}

function ExistingOwner({ productId, onClose, onSaved }: { readonly productId: string; readonly onClose: () => void; readonly onSaved: (id: string | null) => void }): JSX.Element {
  const product = useData<ProductPayload>(API_ROUTES.product(productId));
  const tiers = useData<TierPayload>(API_ROUTES.productTiers(productId));
  if (product.loading || tiers.loading) {
    return <Skeleton className="h-40 w-full" />;
  }
  if (product.error) {
    return <ErrorState message={product.error.message} onRetry={product.refetch} />;
  }
  if (!product.data) {
    return <p className="text-sm text-ink">This product was not found.</p>;
  }
  return (
    <OwnerForm
      product={product.data}
      initialTiers={(tiers.data?.tiers ?? []).map((tier) => ({ minQty: String(tier.minQty), unitPrice: usdt(tier.unitPriceMinor) }))}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function OwnerForm({
  product,
  initialTiers = [],
  onClose,
  onSaved,
}: {
  readonly product: ProductPayload | null;
  readonly initialTiers?: readonly TierDraft[];
  readonly onClose: () => void;
  readonly onSaved: (id: string | null) => void;
}): JSX.Element {
  const [sku, setSku] = useState(product?.sku ?? '');
  const [title, setTitle] = useState(product?.title ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [category, setCategory] = useState(product?.category ?? '');
  const [buyerCategory, setBuyerCategory] = useState(product?.buyerCategory ?? '');
  const [deliveryType, setDeliveryType] = useState(product?.deliveryType ?? 'file_reusable');
  const [durationText, setDurationText] = useState(product?.durationText ?? '');
  const [warrantyText, setWarrantyText] = useState(product?.warrantyText ?? '');
  const [typeLabel, setTypeLabel] = useState(product?.typeLabel ?? '');
  const [wholesale, setWholesale] = useState(product ? usdt(product.wholesalePriceMinor) : '');
  const [retail, setRetail] = useState(product ? usdt(product.retailPriceMinor) : '');
  const [unlimited, setUnlimited] = useState(product?.stockUnlimited ?? true);
  const [stockCount, setStockCount] = useState(product?.stockCount ? String(product.stockCount) : '');
  const [status, setStatus] = useState(product?.status ?? 'draft');
  const [supplierSku, setSupplierSku] = useState(product?.supplierSku ?? '');
  const [tiers, setTiers] = useState<TierDraft[]>(initialTiers.length > 0 ? [...initialTiers] : []);
  const [assets, setAssets] = useState<readonly Asset[]>(product?.assets ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = deliveryType === 'supplier_api' && Boolean(product?.supplierSku);

  async function upload(id: string, file: File, preview: boolean): Promise<void> {
    const body = new FormData();
    body.set('productId', id);
    body.set('file', file);
    body.set('isPreview', preview ? 'true' : 'false');
    const result = await runAction<Asset>(API_ROUTES.productUpload, { body });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setAssets((current) => [...current, result.data]);
  }

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    let id = product?.id ?? null;
    try {
      const prices = {
        wholesalePriceStr: String(usdtToMinor(wholesale || '0')),
        retailPriceStr: String(usdtToMinor(retail || '0')),
      };
      if (!id) {
        const created = await runAction<{ id: string }>(API_ROUTES.products, {
          body: {
            sku,
            title,
            description,
            category,
            deliveryType,
            ...prices,
            stockUnlimited: unlimited,
            ...(unlimited ? {} : { stockCount: Number(stockCount) }),
            resellerEligible: true,
            maxPurchaseQty: 1,
            ...(supplierSku ? { supplierSku } : {}),
            durationText,
            warrantyText,
            typeLabel,
          },
        });
        if (!created.ok) {
          setError(created.error.message);
          setBusy(false);
          return;
        }
        id = created.data.id;
        if (buyerCategory && buyerCategory !== category) {
          await runAction(API_ROUTES.product(id), { method: 'PATCH', body: { buyerCategory } });
        }
      } else {
        const saved = await runAction(API_ROUTES.product(id), {
          method: 'PATCH',
          body: {
            title,
            description,
            category,
            buyerCategory: buyerCategory || null,
            ...(locked ? {} : { deliveryType }),
            ...prices,
            stockUnlimited: locked ? true : unlimited,
            stockCount: unlimited || locked ? null : Number(stockCount),
            durationText: durationText || null,
            warrantyText: warrantyText || null,
            typeLabel: typeLabel || null,
            ...(supplierSku ? { supplierSku } : {}),
          },
        });
        if (!saved.ok) {
          setError(saved.error.message);
          setBusy(false);
          return;
        }
        if (status === 'published' || status === 'paused' || status === 'archived') {
          const moved = await runAction(API_ROUTES.productStatus(id), { method: 'PATCH', body: { status } });
          if (!moved.ok) {
            setError(moved.error.message);
            setBusy(false);
            return;
          }
        }
      }
      const tierBody = tiers
        .filter((tier) => tier.minQty && tier.unitPrice)
        .slice(0, 5)
        .map((tier) => ({ minQty: Number(tier.minQty), unitPrice: tier.unitPrice }));
      const tierResult = await runAction(API_ROUTES.productTiers(id), { method: 'PUT', body: { tiers: tierBody } });
      setBusy(false);
      if (!tierResult.ok) {
        setError(tierResult.error.message);
        onSaved(id);
        return;
      }
      onSaved(id);
      onClose();
    } catch (cause: unknown) {
      setBusy(false);
      setError(cause instanceof Error ? cause.message : 'Enter prices with up to 6 decimals.');
    }
  }

  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      {product ? (
        <p className="sm:col-span-2 font-mono text-xs text-ink-faint">SKU {product.sku}</p>
      ) : (
        <TextField id="product-sku" label="SKU" value={sku} onChange={(event) => setSku(event.target.value)} required />
      )}
      <TextField id="product-title" label="Title" value={title} onChange={(event) => setTitle(event.target.value)} required />
      <div className="sm:col-span-2">
        <TextAreaField id="product-description" label="Description" value={description} onChange={(event) => setDescription(event.target.value)} />
      </div>
      <TextField id="product-category" label="Category" value={category} onChange={(event) => setCategory(event.target.value)} />
      <TextField id="product-buyer-category" label="Buyer category" value={buyerCategory} onChange={(event) => setBuyerCategory(event.target.value)} />
      <SelectField id="product-delivery" label="Delivery" value={deliveryType} options={DELIVERY} disabled={locked} onChange={(event) => setDeliveryType(event.target.value)} />
      <TextField id="product-supplier-sku" label="Supplier SKU" value={supplierSku} onChange={(event) => setSupplierSku(event.target.value)} />
      <TextField id="product-duration" label="Duration" value={durationText} onChange={(event) => setDurationText(event.target.value)} />
      <TextField id="product-warranty" label="Warranty" value={warrantyText} onChange={(event) => setWarrantyText(event.target.value)} />
      <TextField id="product-type-label" label="Type label" value={typeLabel} onChange={(event) => setTypeLabel(event.target.value)} />
      <SelectField id="product-status" label="Status" value={status} options={[{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Live' }, { value: 'paused', label: 'Paused' }, { value: 'archived', label: 'Archived' }]} disabled={!product} onChange={(event) => setStatus(event.target.value)} />
      <TextField id="product-wholesale" label="Wholesale USDT" value={wholesale} onChange={(event) => setWholesale(event.target.value)} />
      <TextField id="product-retail" label="Retail USDT" value={retail} onChange={(event) => setRetail(event.target.value)} />
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={unlimited} disabled={locked} onChange={(event) => setUnlimited(event.target.checked)} />
        Unlimited stock
      </label>
      {unlimited ? null : <TextField id="product-stock" label="Units on hand" value={stockCount} onChange={(event) => setStockCount(event.target.value)} />}
      <div className="sm:col-span-2 space-y-2">
        <p className="text-sm text-ink">Bulk discount tiers</p>
        {tiers.map((tier, index) => (
          <div key={index} className="flex gap-2">
            <TextField id={`tier-qty-${index}`} label="Minimum quantity" value={tier.minQty} onChange={(event) => setTiers(tiers.map((item, itemIndex) => itemIndex === index ? { ...item, minQty: event.target.value } : item))} />
            <TextField id={`tier-price-${index}`} label="Unit price USDT" value={tier.unitPrice} onChange={(event) => setTiers(tiers.map((item, itemIndex) => itemIndex === index ? { ...item, unitPrice: event.target.value } : item))} />
          </div>
        ))}
        {tiers.length < 5 ? <Button variant="secondary" onClick={() => setTiers([...tiers, { minQty: '', unitPrice: '' }])}>Add tier</Button> : null}
      </div>
      {product ? (
        <div className="sm:col-span-2 space-y-2">
          <p className="text-sm text-ink">Images and files</p>
          <ul className="space-y-1">
            {assets.map((asset) => (
              <li key={asset.id} className="flex items-center gap-2 text-sm text-ink">
                <span>{asset.isPreview ? 'Image' : 'File'} · {asset.contentType}</span>
                <a className="underline" href={API_ROUTES.productDownload(product.id, asset.id)}>Download</a>
                <Button variant="destructive" onClick={() => {
                  void runAction(API_ROUTES.productAsset(product.id, asset.id), { method: 'DELETE' }).then((result) => {
                    if (result.ok) setAssets((current) => current.filter((item) => item.id !== asset.id));
                    else setError(result.error.message);
                  });
                }}>Delete</Button>
              </li>
            ))}
          </ul>
          <label className="block text-sm text-ink">
            Add an image
            <input className="mt-1 block text-sm" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(product.id, file, true);
            }} />
          </label>
          <label className="block text-sm text-ink">
            Add a file
            <input className="mt-1 block text-sm" type="file" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(product.id, file, false);
            }} />
          </label>
        </div>
      ) : <p className="sm:col-span-2 text-sm text-ink-soft">Save the draft, then add images and files.</p>}
      {error ? <p className="sm:col-span-2 text-sm" style={{ color: 'var(--fault-ink)' }}>{error}</p> : null}
      <div className="sm:col-span-2 flex gap-2">
        <Button type="submit" loading={busy}>Save product</Button>
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </div>
    </form>
  );
}

function ResellerEditor({
  listingId,
  productId,
  onClose,
  onSaved,
}: {
  readonly listingId: string | null;
  readonly productId: string | null;
  readonly onClose: () => void;
  readonly onSaved: (id: string | null) => void;
}): JSX.Element {
  const tiers = useData<TierPayload>(listingId ? API_ROUTES.resellerListingTiers(listingId) : null);
  const [price, setPrice] = useState('');
  const [markup, setMarkup] = useState('');
  const [drafts, setDrafts] = useState<TierDraft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows = drafts ?? (tiers.data?.tiers ?? []).map((tier) => ({ minQty: String(tier.minQty), unitPrice: usdt(tier.unitPriceMinor) }));

  async function save(): Promise<void> {
    if (!listingId) {
      setError('This listing cannot be edited.');
      return;
    }
    setBusy(true);
    setError(null);
    if (price) {
      try {
        const priced = await runAction(API_ROUTES.resellerListing(listingId), { method: 'PATCH', body: { retailPriceStr: String(usdtToMinor(price)) } });
        if (!priced.ok) {
          setError(priced.error.message);
          setBusy(false);
          return;
        }
      } catch (cause: unknown) {
        setBusy(false);
        setError(cause instanceof Error ? cause.message : 'Enter a retail price.');
        return;
      }
    }
    if (markup) {
      const marked = await runAction(API_ROUTES.resellerMarkup, { body: { markupPercent: Number(markup) } });
      if (!marked.ok) {
        setError(marked.error.message);
        setBusy(false);
        return;
      }
    }
    const tierResult = await runAction(API_ROUTES.resellerListingTiers(listingId), {
      method: 'PUT',
      body: { tiers: rows.filter((tier) => tier.minQty && tier.unitPrice).map((tier) => ({ minQty: Number(tier.minQty), unitPrice: tier.unitPrice })) },
    });
    setBusy(false);
    if (!tierResult.ok) {
      setError(tierResult.error.message);
      return;
    }
    onSaved(productId);
    onClose();
  }

  if (!listingId) {
    return <p className="text-sm text-ink">Open one of your listings to edit its price and tiers.</p>;
  }
  if (tiers.loading) {
    return <Skeleton className="h-24 w-full" />;
  }
  if (tiers.error) {
    return <ErrorState message={tiers.error.message} onRetry={tiers.refetch} />;
  }

  return (
    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <TextField id="listing-price" label="Your retail price USDT" value={price} placeholder="Leave blank to keep the current price" onChange={(event) => setPrice(event.target.value)} />
      <TextField id="listing-markup" label="Store markup percent" value={markup} placeholder="Applies to every listing" onChange={(event) => setMarkup(event.target.value)} />
      <p className="text-sm text-ink">Your tiers</p>
      {rows.map((tier, index) => (
        <div key={index} className="flex gap-2">
          <TextField id={`reseller-tier-qty-${index}`} label="Minimum quantity" value={tier.minQty} onChange={(event) => {
            const next = rows.map((item, itemIndex) => itemIndex === index ? { ...item, minQty: event.target.value } : item);
            setDrafts(next);
          }} />
          <TextField id={`reseller-tier-price-${index}`} label="Unit price USDT" value={tier.unitPrice} onChange={(event) => {
            const next = rows.map((item, itemIndex) => itemIndex === index ? { ...item, unitPrice: event.target.value } : item);
            setDrafts(next);
          }} />
        </div>
      ))}
      {rows.length < 5 ? <Button variant="secondary" onClick={() => setDrafts([...rows, { minQty: '', unitPrice: '' }])}>Add tier</Button> : null}
      {error ? <p className="text-sm" style={{ color: 'var(--fault-ink)' }}>{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" loading={busy}>Save listing</Button>
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </div>
    </form>
  );
}
