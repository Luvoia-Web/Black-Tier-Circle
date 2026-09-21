/**
 * @file app/api/products/upload/route.ts
 *
 * Handles product file uploads to Supabase private storage.
 *
 * Flow:
 * 1. Verify owner auth
 * 2. Validate: productId exists, file type allowed, file size <= 50MB
 * 3. Upload file to 'product-files' bucket at path: products/{productId}/{uuid}.{ext}
 * 4. Create product_asset record in DB
 * 5. Return asset ID and metadata (NOT the storage path — never expose raw paths)
 *
 * Uses multipart/form-data.
 * SECURITY: storage path never returned to client — only asset ID.
 * Signed URLs generated separately on demand.
 *
 * @module Api
 */

import { randomUUID } from 'node:crypto';
import { ValidationError } from '@/lib/errors';
import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess } from '@/lib/http';
import {
  PRODUCT_FILES_BUCKET,
  PRODUCT_PREVIEWS_BUCKET,
  attachAsset,
  getProduct,
  toPublicAsset,
} from '@/modules/catalog';

export const dynamic = 'force-dynamic';

const PRODUCT_FILE_MAX_BYTES = 52_428_800;
const PREVIEW_FILE_MAX_BYTES = 10_485_760;

const PRODUCT_FILE_TYPES = new Set([
  'application/pdf',
  'application/zip',
  'application/epub+zip',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const PREVIEW_FILE_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

function extensionFor(fileName: string, contentType: string): string {
  const fromName = fileName.split('.').pop();
  if (fromName && fromName !== fileName && /^[a-zA-Z0-9]+$/.test(fromName)) {
    return fromName.toLowerCase();
  }
  if (contentType === 'application/pdf') {
    return 'pdf';
  }
  if (contentType === 'application/zip') {
    return 'zip';
  }
  if (contentType === 'application/epub+zip') {
    return 'epub';
  }
  if (contentType === 'image/jpeg') {
    return 'jpg';
  }
  if (contentType === 'image/png') {
    return 'png';
  }
  if (contentType === 'image/webp') {
    return 'webp';
  }
  return 'bin';
}

/**
 * Uploads a product file to the private bucket and records the asset.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    const formData = await request.formData();
    const productIdValue = formData.get('productId');
    const fileValue = formData.get('file');
    const previewValue = formData.get('isPreview');

    if (typeof productIdValue !== 'string' || productIdValue.length === 0) {
      throw new ValidationError('INVALID_INPUT', 'productId is required');
    }
    if (!(fileValue instanceof File)) {
      throw new ValidationError('INVALID_INPUT', 'file is required');
    }

    const isPreview = previewValue === 'true' || previewValue === '1';
    const contentType = fileValue.type || 'application/octet-stream';
    const allowed = isPreview ? PREVIEW_FILE_TYPES : PRODUCT_FILE_TYPES;
    if (!allowed.has(contentType)) {
      throw new ValidationError('INVALID_FILE_TYPE', `File type ${contentType} is not allowed`);
    }

    const maxBytes = isPreview ? PREVIEW_FILE_MAX_BYTES : PRODUCT_FILE_MAX_BYTES;
    if (fileValue.size > maxBytes) {
      throw new ValidationError('FILE_TOO_LARGE', `File exceeds the ${isPreview ? '10MB' : '50MB'} limit`);
    }

    const db = asDbClient(session.admin);
    await getProduct(db, productIdValue);

    const ext = extensionFor(fileValue.name, contentType);
    const storagePath = `products/${productIdValue}/${randomUUID()}.${ext}`;
    const bucket = isPreview ? PRODUCT_PREVIEWS_BUCKET : PRODUCT_FILES_BUCKET;
    const buffer = Buffer.from(await fileValue.arrayBuffer());
    const { error: uploadError } = await session.admin.storage.from(bucket).upload(storagePath, buffer, {
      contentType,
      upsert: false,
    });
    if (uploadError) {
      throw new ValidationError('UPLOAD_FAILED', uploadError.message, 500);
    }

    const asset = await attachAsset(db, productIdValue, {
      storagePath,
      contentType,
      fileSizeBytes: fileValue.size,
      isPreview,
    });

    return jsonSuccess(toPublicAsset(asset), 201);
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
