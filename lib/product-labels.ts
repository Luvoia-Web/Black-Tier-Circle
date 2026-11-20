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

/**
 * Computes 1-2 letter uppercase initials for a product or store title,
 * stripping bracketed tags like "[KEY]" or "(1M)" and leading symbols.
 * Example: "[KEY] HMA VPN" -> "HV", "ChatGPT Plus" -> "CP".
 */
export function productInitials(title: string): string {
  const withoutTags = title.replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, ' ');
  const words = withoutTags
    .split(/\s+/)
    .map((word) => word.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, ''))
    .filter((word) => word.length > 0);
  if (words.length >= 2) {
    return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
  }
  if (words.length === 1) {
    return words[0]!.slice(0, 2).toUpperCase();
  }
  const fallback = title.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase();
  return fallback || 'PR';
}
