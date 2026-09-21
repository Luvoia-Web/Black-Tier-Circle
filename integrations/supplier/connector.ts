/**
 * @file integrations/supplier/connector.ts
 *
 * Supplier connector interface export. No live implementation yet.
 *
 * @module Supplier
 */

import { FulfillmentError } from '@/lib/errors';
import type { SupplierConnector, SupplierFulfillRequest, SupplierFulfillResult } from './types';

export type {
  SupplierConnector,
  SupplierFulfillRequest,
  SupplierFulfillResult,
} from './types';

/**
 * Factory that refuses to fulfill until a real connector is registered.
 *
 * @returns Connector that always throws
 * @throws FulfillmentError on every fulfill call
 */
export function createUnimplementedSupplierConnector(): SupplierConnector {
  return {
    async fulfill(_request: SupplierFulfillRequest): Promise<SupplierFulfillResult> {
      throw new FulfillmentError(
        'SUPPLIER_UNIMPLEMENTED',
        'No supplier connector is registered in Phase 0',
        501,
      );
    },
  };
}
