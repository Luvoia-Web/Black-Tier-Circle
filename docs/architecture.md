# Architecture

High-level Phase 0 / target runtime for Black Tier Circle.

```
                         +------------------+
                         |     Browser      |
                         |  Owner Dashboard |
                         | Reseller Dashboard|
                         +--------+---------+
                                  |
                                  | HTTPS
                                  v
                         +------------------+
                         | Next.js 14 App   |
                         | Vercel           |
                         | app/(dashboard)  |
                         | app/api/*        |
                         +--------+---------+
                                  |
              +-------------------+-------------------+
              |                   |                   |
              v                   v                   v
     +----------------+  +----------------+  +------------------+
     | Supabase Auth  |  | PostgreSQL     |  | Private Storage  |
     | profiles/roles |  | RLS + service  |  | product assets   |
     +----------------+  | role jobs      |  +------------------+
                         | pgmq queues    |
                         +--------+-------+
                                  ^
                                  |
+-------------+          +--------+--------+         +------------------+
| Telegram    | HTTPS    | Webhook         | enqueue | Job worker       |
| user / bot  +--------->+ /api/webhooks/  +-------->+ jobs/dispatch    |
+-------------+          | telegram/[botId]|         | handlers/*       |
                         +-----------------+         +--------+---------+
                                                              |
                                                              v
                                                     Domain modules
                                                     identity tenants
                                                     catalog pricing
                                                     wallet orders
                                                     payments bots
                                                     fulfillment

Reseller API (Phase 7)
  Reseller system -> /api/v1 -> domain modules -> DB
  Idempotency keys on order create and wallet mutations
  Tenant ID from API key / session, never from body

Payment flow (sandbox in Phase 0, live in Phase 5)
  Customer submits claim (Binance order id or BEP20 tx hash)
       |
       v
  integrations/binance  OR  integrations/bsc
       |
       v
  payment_claims row + order payment track
       |
       +--> funding track (reseller wholesale reservation/debit)
       +--> fulfillment track (file / manual / supplier)
       +--> delivery track (Telegram or API)
```
