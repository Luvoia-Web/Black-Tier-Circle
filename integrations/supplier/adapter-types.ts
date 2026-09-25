export type CatalogSupplierProduct = {
  readonly externalId: string;
  readonly title: string;
  readonly description?: string;
  readonly price: number;
  readonly stock: number | 'unlimited';
  readonly category?: string;
  readonly imageUrl?: string;
  readonly deliveryType: 'instant' | 'email_activation' | 'manual';
};

export type CatalogOrderResult = {
  readonly externalOrderId: string;
  readonly status: 'delivered' | 'pending' | 'failed';
  readonly deliveredContent?: string;
  readonly emailUsed?: string;
  readonly estimatedDelivery?: string;
};

export type CatalogBalance = {
  readonly available: number;
  readonly currency: string;
};

export type ConnectionTest = {
  readonly success: boolean;
  readonly error?: string;
  readonly warning?: string;
  readonly supplierName?: string;
  readonly balance?: CatalogBalance;
  readonly productCount?: number;
  readonly adapterName: string;
  readonly baseUrl: string;
  readonly authHeaderName: string;
  readonly authHeaderFormat: 'bare' | 'bearer' | 'query';
  readonly productsEndpoint: string;
  readonly ordersEndpoint: string;
  readonly balanceEndpoint: string;
  readonly apiVersion: string;
};
