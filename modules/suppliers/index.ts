/**
 * @file modules/suppliers/index.ts
 *
 * Supplier registry sandbox. No live supplier calls in Phase 0.
 *
 * @module Suppliers
 */

import type { Supplier } from './types';

export type { Supplier, SupplierId } from './types';

/**
 * Lists configured suppliers. Empty until a connector is registered.
 *
 * @returns Read-only supplier list
 */
export function listSuppliers(): readonly Supplier[] {
  return [];
}
