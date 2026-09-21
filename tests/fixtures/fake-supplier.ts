/**
 * @file tests/fixtures/fake-supplier.ts
 *
 * Test fixture supplier connector with controllable outcomes.
 *
 * @module Tests
 */

import type { SupplierConnector, SupplierOrderResult, SupplierStatusResult } from '@/integrations/supplier/connector';

export function createFakeSupplierConnector(
  overrides: Partial<SupplierConnector> = {},
): SupplierConnector {
  return {
    async createOrder(input): Promise<SupplierOrderResult> {
      return {
        supplierOrderId: `FAKE_${input.internalOrderId}`,
        status: 'completed',
        deliveryData: 'https://fake.example.com/download',
        message: 'fake complete',
        completedAt: new Date(),
      };
    },
    async getOrderStatus(supplierOrderId): Promise<SupplierStatusResult> {
      return {
        supplierOrderId,
        status: 'completed',
        deliveryData: 'https://fake.example.com/download',
        message: 'fake complete',
        completedAt: new Date(),
      };
    },
    async healthCheck(): Promise<boolean> {
      return true;
    },
    ...overrides,
  };
}
