/**
 * @file tests/fixtures/fake-supplier.ts
 *
 * Test fixture supplier connector that accepts sandbox fulfillments.
 *
 * @module Tests
 */

import type { SupplierConnector } from '@/integrations/supplier/connector';

export function createFakeSupplierConnector(): SupplierConnector {
  return {
    async fulfill(request) {
      return {
        accepted: true,
        supplierReference: `FAKE_${request.orderId}`,
      };
    },
  };
}
