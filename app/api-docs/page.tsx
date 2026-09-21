/**
 * @file app/api-docs/page.tsx
 *
 * Public API documentation page.
 * Accessible at /api-docs — no auth required.
 *
 * @module App
 */

import { API_CONFIG } from '@/lib/api-config';
import { ROUTES } from '@/lib/navigation';
import Link from 'next/link';

function Code({ children }: { readonly children: string }): JSX.Element {
  return (
    <pre className="overflow-x-auto rounded-md border border-gray-800 bg-gray-950 p-4 text-xs text-gray-200">
      <code>{children}</code>
    </pre>
  );
}

type EndpointProps = {
  readonly method: string;
  readonly path: string;
  readonly scope: string;
  readonly body?: string;
  readonly response: string;
};

function Endpoint({ method, path, scope, body, response }: EndpointProps): JSX.Element {
  return (
    <section className="space-y-3 rounded-lg border border-gray-800 bg-gray-900 p-5">
      <p className="text-sm font-medium text-indigo-300">
        <span className="mr-2 rounded bg-indigo-500/20 px-2 py-0.5 text-xs">{method}</span>
        {path}
      </p>
      <p className="text-xs text-gray-400">Scope: {scope}</p>
      {body ? (
        <>
          <p className="text-xs uppercase tracking-wide text-gray-500">Request</p>
          <Code>{body}</Code>
        </>
      ) : null}
      <p className="text-xs uppercase tracking-wide text-gray-500">Response</p>
      <Code>{response}</Code>
    </section>
  );
}

/**
 * Static v1 API documentation.
 */
export default function ApiDocsPage(): JSX.Element {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto max-w-4xl space-y-10 px-6 py-12">
        <header>
          <p className="text-sm text-indigo-400">Black Tier Circle</p>
          <h1 className="mt-2 text-3xl font-semibold">Public API v1</h1>
          <p className="mt-2 text-gray-400">
            Versioned, key-authenticated REST API for reseller integrations. Breaking changes go to{' '}
            <code>/api/v2/</code> only.
          </p>
          <Link href={ROUTES.login} className="mt-4 inline-block text-sm text-indigo-400 hover:text-indigo-300">
            Back to login
          </Link>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">1. Authentication</h2>
          <p className="text-sm text-gray-400">
            Send the raw API key on every request. Keys look like <code>btc_live_</code> or{' '}
            <code>btc_test_</code> plus 32 hex characters. Raw keys are shown once at creation.
          </p>
          <Code>{`${API_CONFIG.apiKeyHeader}: btc_test_0123456789abcdef0123456789abcdef`}</Code>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">2. Rate limits</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-300">
            <li>Default: {API_CONFIG.rateLimits.defaultRequestsPerMinute}/minute</li>
            <li>Reads: {API_CONFIG.rateLimits.readRequestsPerMinute}/minute</li>
            <li>Order create: {API_CONFIG.rateLimits.orderCreationPerMinute}/minute</li>
            <li>Payment verify: {API_CONFIG.rateLimits.paymentVerificationPerMinute}/minute</li>
          </ul>
          <p className="text-sm text-gray-400">429 responses include a Retry-After header.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">3. Idempotency</h2>
          <p className="text-sm text-gray-400">
            POST {API_CONFIG.baseUrl}/orders requires {API_CONFIG.idempotencyHeader}. The same key plus the same
            productId returns the original order.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">4. Error format</h2>
          <Code>{`{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…" } }`}</Code>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">5. Endpoints</h2>
          <Endpoint
            method="GET"
            path={`${API_CONFIG.baseUrl}/products`}
            scope="products:read"
            response={`{ "success": true, "data": [{ "id": "…", "sku": "EBOOK-001", "retailPrice": "12.000000" }], "meta": { "page": 1, "limit": 20, "total": 1, "hasMore": false } }`}
          />
          <Endpoint
            method="GET"
            path={`${API_CONFIG.baseUrl}/orders`}
            scope="orders:read"
            response={`{ "success": true, "data": [{ "orderId": "…", "status": { "payment": "awaiting" } }], "meta": { "page": 1, "limit": 20, "total": 1, "hasMore": false } }`}
          />
          <Endpoint
            method="POST"
            path={`${API_CONFIG.baseUrl}/orders`}
            scope="orders:write"
            body={`{ "productId": "uuid", "customerRef": "your-customer-id", "quantity": 1 }`}
            response={`{ "success": true, "data": { "orderId": "…", "paymentOptions": { "bep20": { "walletAddress": "0x…" } } } }`}
          />
          <Endpoint
            method="GET"
            path={`${API_CONFIG.baseUrl}/orders/{orderId}`}
            scope="orders:read"
            response={`{ "success": true, "data": { "orderId": "…", "customerRef": "…", "paymentClaim": null } }`}
          />
          <Endpoint
            method="POST"
            path={`${API_CONFIG.baseUrl}/orders/{orderId}/pay/binance`}
            scope="payments:write"
            response={`{ "success": true, "data": { "prepayId": "…", "checkoutUrl": "…", "isDemoMode": true } }`}
          />
          <Endpoint
            method="POST"
            path={`${API_CONFIG.baseUrl}/orders/{orderId}/pay/binance/verify`}
            scope="payments:write"
            body={`{ "binanceOrderId": "PAY_123" }`}
            response={`{ "success": true, "data": { "verified": true, "message": "Payment verified" } }`}
          />
          <Endpoint
            method="POST"
            path={`${API_CONFIG.baseUrl}/orders/{orderId}/pay/bep20`}
            scope="payments:write"
            body={`{ "txHash": "0x" + 64 hex chars }`}
            response={`{ "success": true, "data": { "verified": true, "message": "Payment verified" } }`}
          />
          <Endpoint
            method="GET"
            path={`${API_CONFIG.baseUrl}/wallet`}
            scope="orders:read"
            response={`{ "success": true, "data": { "balanceTotal": "20.000000", "balanceReserved": "0.000000", "balanceAvailable": "20.000000" } }`}
          />
          <Endpoint
            method="GET | POST | DELETE"
            path={`${API_CONFIG.baseUrl}/webhooks`}
            scope="webhook:manage"
            body={`POST { "url": "https://example.com/hook", "events": ["order.fulfilled"] }\nDELETE { "webhookId": "uuid" }`}
            response={`{ "success": true, "data": { "webhookId": "…", "secret": "shown-once" } }`}
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">6. Webhooks</h2>
          <p className="text-sm text-gray-400">
            We POST JSON to your HTTPS URL with header {API_CONFIG.webhooks.signatureHeader} set to HMAC-SHA256
            (hex) of the raw body using the webhook secret. Verify with a timing-safe compare.
          </p>
          <Code>{`{ "event": "order.payment_verified", "timestamp": "2026-09-21T00:00:00.000Z", "data": { "orderId": "…", "tenantId": "…" } }`}</Code>
          <p className="text-sm text-gray-400">Events: {API_CONFIG.webhooks.events.join(', ')}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">7. SDKs</h2>
          <p className="text-sm text-gray-400">Official SDKs coming soon. Use any HTTP client with the headers above.</p>
        </section>
      </div>
    </div>
  );
}
