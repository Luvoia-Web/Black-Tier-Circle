/**
 * @file integrations/supplier/types.ts
 *
 * Supplier connector contract. No implementation in Phase 0.
 *
 * @module Supplier
 */

export type SupplierFulfillRequest = {
  readonly orderId: string;
  readonly sku: string;
  readonly quantity: number;
  readonly idempotencyKey: string;
};

export type SupplierFulfillResult = {
  readonly accepted: boolean;
  readonly supplierReference?: string;
  readonly error?: string;
};

export interface SupplierConnector {
  fulfill(request: SupplierFulfillRequest): Promise<SupplierFulfillResult>;
}
