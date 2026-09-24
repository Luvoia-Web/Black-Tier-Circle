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
    const products = await listProducts(asDbClient(session.admin), filters);
    return jsonSuccess(products, 200, { cache: 'short' });
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
