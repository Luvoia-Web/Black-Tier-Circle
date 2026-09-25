/**
 * Human labels for catalog delivery types.
 */

export function productTypeLabel(product: {
  readonly deliveryType: string;
  readonly supplierId?: string | null;
  readonly supplierName?: string | null;
}): string {
  if (product.supplierId && product.supplierName) {
    return product.supplierName;
  }
  if (product.deliveryType === 'manual') {
    return 'Manual Delivery';
  }
  if (product.deliveryType === 'supplier_api') {
    return 'Supplier API';
  }
  return 'Own Product';
}

export function productTypeTone(label: string): string {
  if (label === 'Own Product') {
    return 'text-[var(--green)]';
  }
  if (label === 'Manual Delivery') {
    return 'text-[var(--amber)]';
  }
  return 'text-[var(--accent-soft)]';
}
