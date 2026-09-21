/**
 * @file modules/suppliers/types.ts
 *
 * Supplier registry types. Connector implementation lives under integrations.
 *
 * @module Suppliers
 */

export type SupplierId = string;

export type Supplier = {
  readonly id: SupplierId;
  readonly displayName: string;
  readonly isEnabled: boolean;
};
