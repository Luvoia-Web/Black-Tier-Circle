# Black Tier MemoryOS

> Black Tier MemoryOS is a three-layer commerce intelligence system where customers develop relationship memory, resellers develop institutional business memory, and the platform develops operational memory — while Supabase maintains current transactional truth and Hindsight accumulates experience from what previously happened.

**Live demo:** https://blacktiercircle.vercel.app

## What This Does

Black Tier MemoryOS records what a sale, an objection, or an incident meant, then uses that experience the next time a reseller or the assistant has to decide. Supabase keeps the order, the payment, and the fulfillment state exact. Hindsight keeps the pattern: how this buyer pays, which price they refused, which recovery worked, which recommendation converted. Recall and reflect run before a recommendation. Retain runs after the event is already true. If memory is unavailable, commerce continues.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     BLACK TIER MEMORYOS                             │
├─────────────────────────────────────────────────────────────────────┤
│  CUSTOMER LAYER                                                     │
│  btc-prod:tenant:{id}:customer:{id}                                 │
│  - Preferences, objections, interaction history                     │
│  - AI recommendation at purchase moment                             │
│  - Outcome learning (converted / rejected)                          │
│                                                                     │
│  RESELLER / TENANT LAYER                                            │
│  btc-prod:tenant:{id}                                               │
│  - Business policies, pricing rules, seller instructions            │
│  - Store incidents + recovery patterns                              │
│  - Cross-customer pattern recognition                               │
│                                                                     │
│  PLATFORM LAYER                                                     │
│  btc-prod:platform                                                  │
│  - System-wide operational patterns                                 │
│  - Infrastructure health history                                    │
│  - Global commerce anomaly detection                                │
├─────────────────────────────────────────────────────────────────────┤
│  DATA FLOW                                                          │
│  Telegram Bot → Supabase (System of Record)                         │
│       ├──► Hindsight Retain (after every event)                     │
│       └──► Hindsight Recall + Reflect (before decisions)            │
├─────────────────────────────────────────────────────────────────────┤
│  API ROUTES                                                         │
│  POST /api/intelligence/customer   — Customer intelligence          │
│  GET  /api/intelligence/customer   — Memory Inspector               │
│  POST /api/intelligence/store      — Store intelligence             │
│  POST /api/intelligence/recovery   — Commerce recovery              │
│  POST /api/intelligence/outcome    — Outcome recording              │
│  POST /api/assistant               — Grok AI + memory context       │
├─────────────────────────────────────────────────────────────────────┤
│  MEMORY PRIMITIVES                                                  │
│  retain(bankId, content, options)  — Store an experience            │
│  recall(bankId, query, options)    — Retrieve relevant memories     │
│  reflect(bankId, query, options)   — Generate insight from memory   │
│  Bank isolation: hard boundary — zero cross-tenant leakage          │
│  Fail-open: commerce never blocked if Hindsight is unavailable      │
└─────────────────────────────────────────────────────────────────────┘
```

## Memory Layers

### Customer Memory (btc-prod:tenant:{id}:customer:{id})

Stores preferences, objections, purchase context, chat turns, and recommendation outcomes for one buyer inside one store. Powers the Customer Intelligence panel, the Memory Inspector, and the memory context injected into the assistant before Grok replies.

### Reseller / Store Memory (btc-prod:tenant:{id})

Stores business policies, pricing habits, seller instructions, and incident recoveries for one tenant. Powers Store Intelligence and Commerce Recovery. Outcomes are also retained here so a pattern that converted can be seen across customers without mixing customer banks.

### Platform Memory (btc-prod:platform)

Reserved for system-wide operational patterns, infrastructure health history, and commerce anomalies that are not customer-specific. The isolation smoke test expects this bank to contain no customer memories.

## Key Features

### 1. Customer Intelligence Panel

- Before / After memory toggle
- Preferences, known objections, AI recommendation
- Outcome recording: Converted / Rejected

### 2. Memory Inspector

- WHY? button on every recommendation
- Evidence chain with type badges and timestamps
- Powered by Hindsight by Vectorize

### 3. Store Intelligence

- Cross-customer pattern recognition
- Seller instructions from store history

### 4. Commerce Recovery Intelligence

- Incident input → past incidents recalled → recovery suggested
- Stops stores from re-solving the same problem twice

### 5. Memory-Powered Chatbot (Grok AI)

- ✦ Memory badge on memory-powered responses
- Context injected from customer bank before every response

## Bank Isolation

Bank ID = hard isolation boundary:

```
btc-prod:platform
btc-prod:tenant:{tenantId}
btc-prod:tenant:{tenantId}:customer:{id}
```

Isolation proof: `npm run memory:smoke` → 3 PASS

The same customer id under a different tenant returns no memories. The platform bank returns no customer memories.

## Memory Primitives

```
retain(bankId, content, options)   // Store an experience
recall(bankId, query, options)     // Retrieve relevant memories
reflect(bankId, query, options)    // Generate insight from memory
```

Powered by Hindsight by Vectorize (`@vectorize-io/hindsight-client`).

Every retain call passes a stable `documentId` so a repeated event replaces the prior document instead of duplicating it.

## Fail-Open Design

Every Hindsight call is wrapped in try/catch. Commerce is never blocked if memory is unavailable. Recall returns an empty list, reflect returns an empty decision, and intelligence routes respond with `degraded: true` at HTTP 200. Fulfillment does not wait on retain.

## Tech Stack

- Framework: Next.js 14.2.21 + TypeScript
- System of Record: Supabase
- System of Experience: Hindsight by Vectorize
- AI: Grok (grok-3)
- Commerce Channel: Telegram (multi-bot, per-tenant)
- Deployment: Vercel

## Getting Started

```
git clone https://github.com/Luvoia-Web/Black-Tier-Circle
cd Black-Tier-Circle
cp .env.example .env.local
npm install
npm run dev
```

Seed demo memories:

```
npm run memory:seed
```

Test bank isolation:

```
npm run memory:smoke
```

`GROK_API_KEY` and `HINDSIGHT_API_KEY` are server-side only. Do not prefix them with `NEXT_PUBLIC_`.

## API Reference

- `POST /api/intelligence/customer` — Recall + reflect for a customer
- `GET /api/intelligence/customer` — Memory Inspector (by decisionId)
- `POST /api/intelligence/store` — Store intelligence + seller instructions
- `POST /api/intelligence/recovery` — Commerce incident recovery
- `POST /api/intelligence/outcome` — Record converted / rejected outcome
- `POST /api/assistant` — Grok AI chat with memory context

Tenant id is taken from the authenticated session, not from the request body.

## Project Structure

```
lib/hindsight.ts                     — HindsightClient, bank resolvers, fail-open wrappers
lib/order-memory.ts                  — Purchase memory retention after fulfillment
lib/intelligence-session.ts          — Tenant resolution from authenticated session
app/api/intelligence/customer/       — Customer intelligence endpoint
app/api/intelligence/store/          — Store intelligence endpoint
app/api/intelligence/recovery/       — Commerce recovery endpoint
app/api/intelligence/outcome/        — Outcome recording endpoint
components/intelligence/             — All UI panels
scripts/seed-memory-demo.ts          — Seeds 5 demo memories across banks
scripts/test-memory-isolation.ts     — Verifies zero cross-tenant leakage
```

Commerce should learn. Now it does.
