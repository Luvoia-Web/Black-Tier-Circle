/**
 * @file integrations/supplier/types.ts
 *
 * Supplier connector types — generic interface, not supplier-specific.
 * Any supplier must map their API to these types.
 * The rest of the system only knows these types, never supplier internals.
 */

export type SupplierOrderStatus =
  | 'pending' // submitted, awaiting supplier processing
  | 'processing' // supplier is working on it
  | 'completed' // supplier fulfilled it, delivery_data available
  | 'failed' // supplier could not fulfill
  | 'cancelled' // supplier cancelled
  | 'unknown'; // could not determine status (timeout or API error)

export type SupplierCreateOrderInput = {
  /** Our internal order ID — used as idempotency key with supplier */
  internalOrderId: string;
  /** Product SKU as known to the supplier */
  supplierProductSku: string;
  /** Quantity */
  quantity: number;
  /** Customer reference (optional — some suppliers use this for delivery) */
  customerRef?: string;
};

export type SupplierOrderResult = {
  /** Supplier's own reference for this order */
  supplierOrderId: string;
  status: SupplierOrderStatus;
  /**
   * Data needed to deliver to customer.
   * Shape depends on product type — could be a download URL, a license key, etc.
   * Always a string (URL, key, text) — supplier-specific parsing handled in adapter.
   */
  deliveryData: string | null;
  /** Human-readable status message from supplier */
  message: string | null;
  /** When the supplier completed this order */
  completedAt: Date | null;
};

export type SupplierStatusResult = {
  supplierOrderId: string;
  status: SupplierOrderStatus;
  deliveryData: string | null;
  message: string | null;
  completedAt: Date | null;
};

/** The interface every supplier adapter must implement */
export interface SupplierConnector {
  /** Submit a new order to the supplier */
  createOrder(input: SupplierCreateOrderInput): Promise<SupplierOrderResult>;
  /** Check the status of an existing supplier order */
  getOrderStatus(supplierOrderId: string): Promise<SupplierStatusResult>;
  /** Test connectivity — returns true if supplier API is reachable */
  healthCheck(): Promise<boolean>;
}
