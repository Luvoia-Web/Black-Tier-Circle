/**
 * @file modules/public-api/types.ts
 *
 * Public reseller API types for keys, scopes, and authenticated request context.
 *
 * @module PublicApi
 */

export type ApiKey = {
  id: string;
  tenantId: string;
  keyPrefix: string;
  label: string;
  environment: 'live' | 'test';
  scopes: ApiScope[];
  isActive: boolean;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
};

export type ApiScope =
  | 'orders:read'
  | 'orders:write'
  | 'products:read'
  | 'payments:write'
  | 'webhook:manage';

export type CreateApiKeyInput = {
  tenantId: string;
  label: string;
  environment: 'live' | 'test';
  scopes?: ApiScope[];
  expiresAt?: Date;
  createdBy: string;
};

export type ApiKeyCreationResult = {
  apiKey: ApiKey;
  /** Raw key — shown ONCE, never retrievable. Store it now. */
  rawKey: string;
};

export type AuthenticatedApiContext = {
  tenantId: string;
  apiKeyId: string;
  scopes: ApiScope[];
  environment: 'live' | 'test';
};

export type ApiKeyRow = {
  readonly id: string;
  readonly tenant_id: string;
  readonly key_hash: string;
  readonly key_prefix: string;
  readonly label: string;
  readonly environment: string;
  readonly scopes: string[] | null;
  readonly is_active: boolean;
  readonly last_used_at: string | null;
  readonly expires_at: string | null;
  readonly created_by: string;
  readonly created_at: string;
  readonly revoked_at: string | null;
  readonly revoked_by: string | null;
};

export type WebhookEndpoint = {
  readonly id: string;
  readonly tenantId: string;
  readonly url: string;
  readonly events: WebhookEvent[];
  readonly secretPrefix: string;
  readonly isActive: boolean;
  readonly failureCount: number;
  readonly lastTriggeredAt: Date | null;
  readonly createdAt: Date;
};

export type WebhookEvent =
  | 'order.payment_verified'
  | 'order.fulfilled'
  | 'order.delivered'
  | 'order.failed'
  | 'order.cancelled'
  | 'order.paid'
  | 'reseller.activated';

export type CreateWebhookInput = {
  readonly tenantId: string;
  readonly url: string;
  readonly events: WebhookEvent[];
};

export type WebhookCreationResult = {
  readonly webhook: WebhookEndpoint;
  readonly rawSecret: string;
};

export type WebhookEndpointRow = {
  readonly id: string;
  readonly tenant_id: string;
  readonly url: string;
  readonly events: string[] | null;
  readonly secret: string;
  readonly secret_hash: string;
  readonly secret_prefix: string;
  readonly is_active: boolean;
  readonly failure_count: number;
  readonly last_triggered_at: string | null;
  readonly created_at: string;
};
