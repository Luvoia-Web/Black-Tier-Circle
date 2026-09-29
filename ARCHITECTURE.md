# Black Tier Circle — Architecture

> Technical architecture reference for Black Tier Circle.  
> See also: [README.md](./README.md) · [INNOVATION.md](./INNOVATION.md)

---

## System Overview

Black Tier Circle is a **multi-tenant SaaS platform** built on Next.js 14 with Supabase as the primary data layer. Every architectural decision prioritizes three properties:

1. **Tenant isolation** — one reseller can never see another's data
2. **Operational reliability** — fulfillment runs on automated cycles, not manual triggers
3. **Security by default** — secrets never touch the browser, tokens encrypted at rest

---

## Request Flow

### Customer Purchase Flow (Telegram Bot)

```
Customer sends message
        │
        ▼
POST /api/webhooks/telegram/[botConnectionId]
        │
        ├─► Lookup bot_connection by ID
        ├─► Decrypt bot token (AES-256-GCM)
        ├─► Verify update_id not in processed_telegram_updates (idempotency)
        ├─► Insert update_id into processed_telegram_updates
        ├─► Resolve tenant_id from bot_connection
        │
        ▼
    grammY Handler
        │
        ├─► /shop → Fetch reseller_listings for this tenant
        ├─► Quantity select → Reserve wallet balance (wallet_reservations)
        ├─► Payment method selection:
        │       ├─ Wallet: debit ledger_transaction immediately
        │       ├─ Binance Pay: create payment_claim, poll for confirmation
        │       ├─ BEP20/TRC20: create payment_claim, await webhook/manual confirm
        │
        ▼
    Order Created (status: pending_fulfillment)
        │
        ▼
POST /api/fulfillment/process  ← cron: every 2 minutes
        │
        ├─► Fetch all pending_fulfillment orders
        ├─► For each order:
        │       ├─ Supplier API product? → Call supplier adapter immediately
        │       ├─ Manual delivery? → Flag for owner action
        │       └─ Record fulfillment_attempt
        │
        ▼
    Order status → completed
    Delivery sent to customer in Telegram
```

### Reseller Onboarding Flow

```
Reseller receives invitation link
        │
        ▼
    Accepts invitation → Creates profile (Supabase Auth)
        │
        ▼
    Reseller Dashboard → "Connect Bot" flow
        │
        ├─► Paste BotFather token
        ├─► Server validates token with Telegram API
        ├─► Encrypt token: AES-256-GCM with BOT_TOKEN_ENCRYPTION_KEY
        ├─► Store in bot_connections (encrypted_token, iv, auth_tag)
        ├─► Register webhook: setWebhook({url: APP_URL/api/webhooks/telegram/{id}})
        │
        ▼
    Bot is live — reseller's customers can now purchase
    Time from token paste to live bot: < 60 seconds
```

---

## Database Architecture

### Design Principles

- **Bigint monetary precision**: All USDT amounts stored as minor units (1 USDT = 1,000,000). No floating point arithmetic for money — ever.
- **Double-entry ledger**: Every balance change creates two `ledger_transaction` rows (debit + credit). Balance is always sum of ledger, never a stored field that can drift.
- **Immutable order events**: `order_events` is append-only. Order history is never deleted or updated — only new status events are appended.
- **Idempotency**: `processed_telegram_updates` prevents double-processing of Telegram webhook deliveries.

### Row Level Security Model

Every table with tenant-scoped data enforces RLS policies at the PostgreSQL level:

```sql
-- Example: customers table
CREATE POLICY "Tenants see only their customers"
ON customers FOR ALL
USING (tenant_id = auth.jwt() ->> 'tenant_id');

-- Platform owner sees all (service role bypasses RLS)
-- Resellers only ever see their own tenant's rows
```

### Table Relationships

```
profiles (1) ──── (1) tenants
tenants (1) ──── (N) bot_connections
tenants (1) ──── (N) customers
tenants (1) ──── (N) reseller_listings ──── (N) products (owner)
customers (1) ──── (N) orders
orders (1) ──── (N) order_events          [append-only]
orders (1) ──── (N) fulfillment_attempts
orders (1) ──── (N) delivery_attempts
customers (1) ──── (1) wallets
wallets (1) ──── (N) ledger_transactions  [double-entry]
products (N) ──── (1) suppliers
```

---

## Multi-Tenant Bot Architecture

### Webhook Isolation

Each Telegram bot registered on the platform gets its own unique webhook URL:

```
https://blacktiercircle.vercel.app/api/webhooks/telegram/{bot_connection_uuid}
```

The `bot_connection_uuid` is a UUID generated at registration time. It:
- Is not guessable (UUID v4)
- Never contains tenant information directly (resolved from DB lookup)
- Is unique per bot registration, not per tenant

### Token Security Model

```typescript
// Encryption at registration time
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
const encryptedToken = Buffer.concat([cipher.update(token), cipher.final()]);
const authTag = cipher.getAuthTag();

// Stored: { encrypted_token, iv, auth_tag } — never the plaintext
// Decrypted: only at request time, held in memory for the duration of one request
// Never logged, never serialized to response
```

---

## Supplier Adapter System

Universal adapter pattern with auto-detection from API key prefix:

```typescript
export function createSupplierAdapter(apiKey: string): SupplierAdapter {
  if (apiKey.startsWith('psk_')) return new ProdSellerAdapter(apiKey);
  if (apiKey.startsWith('tgb_')) return new CanbosoAdapter(apiKey);
  return new GenericAdapter(apiKey);
}
```

### Adapter Interface

```typescript
interface SupplierAdapter {
  listProducts(): Promise<SupplierProduct[]>;
  purchase(productId: string, quantity: number): Promise<PurchaseResult>;
  checkStock(productId: string): Promise<number>;
}
```

### Canboso Adapter (Primary)

```
GET  /api/v2/telegram-buyer/products    → catalog sync
POST /api/v2/telegram-buyer/purchase    → instant fulfillment
```

---

## MemoryOS Architecture

See [INNOVATION.md](./INNOVATION.md) for the full MemoryOS specification.

### Memory Bank Naming Convention

```
{prefix}:platform                           ← Layer 1
{prefix}:tenant:{tenantId}                  ← Layer 2  
{prefix}:tenant:{tenantId}:customer:{id}    ← Layer 3
```

Where `{prefix}` = `HINDSIGHT_BANK_PREFIX` env var (e.g. `btc-prod`).

### API Endpoint Security

Bank IDs are **never accepted from the browser**. They are always resolved server-side:

```typescript
// app/api/assistant/route.ts
// ✅ Correct: bank ID derived from server-side session
const session = await getServerSession();
const bankId = resolveCustomerMemoryBank(session.tenantId, session.customerId);

// ❌ Never: const bankId = req.body.bankId  ← not in codebase
```

---

## Caching Strategy

| Data Type | Cache Duration | Strategy |
|-----------|---------------|---------|
| Product catalog | 60 seconds | In-memory per bot context |
| Customer record | 30 seconds | In-memory per bot context |
| Bot context (tenant, config) | 120 seconds | In-memory per bot context |
| Supplier catalog | Until next sync cron | Database cache in `supplier_products` |

---

## Automated Jobs

All cron endpoints are secured with `CRON_SECRET` header validation:

```typescript
// Middleware on all /api/fulfillment/*, /api/supplier/*, /api/bots/*
const secret = req.headers.get('x-cron-secret');
if (secret !== process.env.CRON_SECRET) {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
```

| Endpoint | Interval | Purpose |
|----------|---------|---------|
| `/api/fulfillment/process` | Every 2 min | Process pending orders, trigger delivery |
| `/api/supplier/reconcile` | Every 15 min | Reconcile order status with supplier |
| `/api/supplier/sync` | Every 30 min | Sync supplier product catalog |
| `/api/bots/health` | Every 30 min | Verify all bot webhooks are responsive |

---

## Frontend Architecture

### Design System

- **Theme**: CSS custom properties for all colors; dark and light both first-class
- **Toggle**: 0.35s crossfade transition; light mode is default
- **Sidebar**: 220px expanded / 64px collapsed; mobile overlay
- **Scrollbar**: Custom 3px violet platform-wide
- **Background**: SceneBackground component — floating orbs + parallax grid + particle field
- **Landing page**: Stone-and-gold liquid-glass aesthetic; Cormorant + Montserrat fonts

### RIA Chat Architecture (Assistant)

```
AssistantPage (session management)
  │
  ├─ localStorage key: 'btc-chat-sessions'
  ├─ Max sessions: 10 (sliding window)
  ├─ Each session: { id: UUID, title: string, messages: Message[] }
  │
  └─ AssistantChat (message rendering)
       │
       ├─ Memory badge: shown when response.memoryUsed === true
       ├─ Quick prompts: MemoryOS-relevant questions
       └─ POST /api/assistant → { message, memoryUsed, sessionId }
```

---

## Deployment

```
GitHub Push
    │
    ▼
Vercel (automatic deploy)
    │
    ├─ Build: next build (TypeScript strict, no errors)
    ├─ Environment: all secrets in Vercel Environment Variables
    ├─ Region: Singapore (closest to India user base)
    │
    ▼
Production: blacktiercircle.vercel.app
    │
    └─ External cron: cron-job.org pings all 4 endpoints on schedule
```

---

## Migration History

21 migrations applied, in order, with no rollbacks:

```
0001 · Initial schema — profiles, tenants
0002 · Bot connections + webhook infrastructure  
0003 · Product catalog + assets
0004 · Customer records + wallet system
0005 · Order lifecycle + events
0006 · Ledger double-entry system
0007 · Fulfillment + delivery attempt tracking
0008 · Payment claims (Binance Pay + USDT)
0009 · Supplier system + adapters
0010 · Reseller listings + margins
0011 · Invitation system
0012 · API keys
0013 · Audit log
0014 · Platform + tenant settings
0015 · Topup tokens (12-digit wallet recharge)
0016 · Processed updates (idempotency)
0017 · Webhook endpoints registry
0018 · Wallet reservations (checkout holds)
0019 · Notifications
0020 · Supplier products cache
0021 · RLS policy hardening across all tables
```

---

*Architecture maintained by Kushal Chaudhari — [linkedin.com/in/kush0090](https://linkedin.com/in/kush0090)*
