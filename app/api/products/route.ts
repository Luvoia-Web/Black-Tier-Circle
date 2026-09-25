/**
 * @file app/api/products/route.ts
 *
 * GET — owner only: list all products with filters
 * POST — owner only: create a draft product (files upload separately)
 *
 * @module Api
 */

import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { CreateProductSchema } from '@/lib/validations/catalog';
import { productTypeLabel } from '@/lib/product-labels';
import { createProduct, listProducts, type ProductStatus } from '@/modules/catalog';
import { createNotification, notifyResellersOfProduct } from '@/modules/notifications';

export const dynamic = 'force-dynamic';

const STATUSES: ReadonlyArray<ProductStatus> = ['draft', 'published', 'paused', 'archived'];

/**
 * Lists products for the owner. Supports `status` and `category` query params.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    const url = new URL(request.url);
    const statusParam = url.searchParams.get('status');
    const category = url.searchParams.get('category');
    const status =
      statusParam !== null && STATUSES.includes(statusParam as ProductStatus)
        ? (statusParam as ProductStatus)
        : undefined;
    const filters =
      status === undefined && (category === null || category === '')
        ? undefined
        : {
            ...(status !== undefined ? { status } : {}),
            ...(category !== null && category !== '' ? { category } : {}),
          };
    const db = asDbClient(session.admin);
    const products = await listProducts(db, filters);
    const supplierIds = [...new Set(products.map((product) => product.supplierId).filter((id): id is string => Boolean(id)))];
    const supplierNames = new Map<string, string>();
    if (supplierIds.length > 0) {
      const supplierRows = await db.from('suppliers').select('id, name').in('id', supplierIds);
      for (const raw of Array.isArray(supplierRows.data) ? supplierRows.data : []) {
        const row = raw as { id?: string; name?: string };
        if (row.id && row.name) {
          supplierNames.set(row.id, row.name);
        }
      }
    }
    const sales = new Map<string, number>();
    const paid = await db.from('orders').select('product_id').eq('payment_status', 'verified');
    for (const raw of Array.isArray(paid.data) ? paid.data : []) {
      const id = (raw as { product_id?: string }).product_id;
      if (id) {
        sales.set(id, (sales.get(id) ?? 0) + 1);
      }
    }
    return jsonSuccess(
      products.map((product) => {
        const supplierName = product.supplierId ? supplierNames.get(product.supplierId) ?? null : null;
        return {
          ...product,
          supplierName,
          typeLabel: productTypeLabel({
            deliveryType: product.deliveryType,
            supplierId: product.supplierId,
            supplierName,
          }),
          salesCount: sales.get(product.id) ?? 0,
        };
      }),
      200,
      { cache: 'short' },
    );
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}

/**
 * Creates a draft product from JSON. Prices must be numeric strings in minor units.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    const parsed = CreateProductSchema.parse(await readJsonBody(request));
    const product = await createProduct(asDbClient(session.admin), {
      sku: parsed.sku,
      title: parsed.title,
      deliveryType: parsed.deliveryType,
      wholesalePriceMinor: parsed.wholesalePriceStr,
      retailPriceMinor: parsed.retailPriceStr,
      ...(parsed.description !== undefined ? { description: parsed.description } : {}),
      ...(parsed.category !== undefined ? { category: parsed.category } : {}),
      stockUnlimited: parsed.stockUnlimited,
      ...(parsed.stockCount !== undefined ? { stockCount: parsed.stockCount } : {}),
      resellerEligible: parsed.resellerEligible,
      maxPurchaseQty: parsed.maxPurchaseQty,
      ...(parsed.estimatedDeliveryMinutes !== undefined
        ? { estimatedDeliveryMinutes: parsed.estimatedDeliveryMinutes }
        : {}),
      ...(parsed.supplierSku !== undefined ? { supplierSku: parsed.supplierSku } : {}),
      ...(parsed.supplierMetadata !== undefined ? { supplierMetadata: parsed.supplierMetadata } : {}),
    });
    const db = asDbClient(session.admin);
    await notifyResellersOfProduct(db, 'New product', `${product.title} was added to the catalog.`, {
      productId: product.id,
    });
    await createNotification(db, {
      userId: session.user.id,
      type: 'product_added',
      title: 'Product Added',
      body: `${product.title} is now in the catalog.`,
      metadata: { productId: product.id },
    });
    return jsonSuccess(product, 201);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
