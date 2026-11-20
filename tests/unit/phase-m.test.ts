/**
 * @file tests/unit/phase-m.test.ts
 *
 * Phase M test suite verifying end-to-end reseller experience & strict tenant isolation:
 * 1. Overview & Today: reseller sees only their orders/revenue, no Top resellers, no global buyer counts
 * 2. Catalog, Inventory & Pricing: reseller sees only own listings, zero supplier names or raw supplier SKUs,
 *    and reseller-scoped default markup & overrides
 * 3. Orders & Order Detail: reseller search stays tenant-scoped; detail hides upstream supplier name,
 *    supplierSku, artifactPath, and canReplaceFromSupplier; cross-tenant/owner orders return 403
 * 4. Customers & Support: reseller with botId=null / tenantId=null cannot read owner-store buyers or threads
 * 5. Bots & Money: reseller receives only own bot, orders, buyers, wallet, ledger, and debts
 *
 * @module Tests
 */

import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { encrypt } from '@/lib/encryption';
import { readBots, readBotDetail } from '@/modules/platform/bots-desk';
import { parseCatalogFilters, readCatalog, readCatalogDetail } from '@/modules/platform/catalog';
import { readInventory } from '@/modules/platform/inventory';
import { readMoney } from '@/modules/platform/money';
import { parseOrderFilters, readOrders } from '@/modules/platform/orders';
import { readOverview } from '@/modules/platform/overview';
import { readPerson } from '@/modules/platform/people';
import { readPricing } from '@/modules/platform/pricing';
import { readSupportThread, setSupportThreadStatus } from '@/modules/platform/support';
import { readToday } from '@/modules/platform/today';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const { mockRequireRole } = vi.hoisted(() => ({
  mockRequireRole: vi.fn(),
}));

vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();
  return {
    ...actual,
    requireRole: mockRequireRole,
  };
});

import { GET as orderDetailGet } from '@/app/api/orders/[orderId]/detail/route';

const OWNER_USER = '00000000-0000-4000-8000-000000000001';
const RESELLER_USER = '00000000-0000-4000-8000-000000000002';
const TENANT_A = '00000000-0000-4000-8000-000000000010';
const TENANT_B = '00000000-0000-4000-8000-000000000011';
const BOT_A = '00000000-0000-4000-8000-000000000201';
const SUP_ID = '00000000-0000-4000-8000-000000000901';
const SUP_PROD_ID = '00000000-0000-4000-8000-000000000902';
const PROD_LISTED = '00000000-0000-4000-8000-000000000101';
const PROD_OWNER_ONLY = '00000000-0000-4000-8000-000000000102';
const LISTING_A = '00000000-0000-4000-8000-000000000401';
const CUST_OWNER = '00000000-0000-4000-8000-000000000301';
const CUST_RESELLER = '00000000-0000-4000-8000-000000000302';
const ORD_OWNER = '00000000-0000-4000-8000-000000000501';
const ORD_RESELLER = '00000000-0000-4000-8000-000000000502';
const THREAD_OWNER = '00000000-0000-4000-8000-000000000601';
const WALLET_A = '00000000-0000-4000-8000-000000000701';
const WALLET_B = '00000000-0000-4000-8000-000000000702';

const PREVIOUS_KEY = process.env.BOT_TOKEN_ENCRYPTION_KEY;

beforeAll(() => {
  process.env.BOT_TOKEN_ENCRYPTION_KEY = 'ef'.repeat(32);
});

afterAll(() => {
  if (PREVIOUS_KEY === undefined) {
    delete process.env.BOT_TOKEN_ENCRYPTION_KEY;
  } else {
    process.env.BOT_TOKEN_ENCRYPTION_KEY = PREVIOUS_KEY;
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  mockRequireRole.mockReset();
});

function buildFixtureDb() {
  return createMemoryDb({
    platform_settings: [
      {
        id: 'ps-1',
        platform_name: 'Black Tier Circle',
        owner_bot_status: 'connected',
        owner_bot_username: 'blacktiercirclebot',
        owner_bot_token_encrypted: encrypt('12345:OWNERBOTTOKEN'),
      },
    ],
    tenants: [
      {
        id: TENANT_A,
        owner_user_id: RESELLER_USER,
        display_name: 'Prince Store',
        business_name: 'Prince Digital',
        support_contact: '@prince',
        status: 'active',
        created_at: '2026-10-01T00:00:00.000Z',
        updated_at: '2026-10-10T00:00:00.000Z',
      },
      {
        id: TENANT_B,
        owner_user_id: '00000000-0000-4000-8000-000000000003',
        display_name: 'Other Store',
        business_name: 'Other Digital',
        support_contact: '@other',
        status: 'active',
        created_at: '2026-10-01T00:00:00.000Z',
        updated_at: '2026-10-10T00:00:00.000Z',
      },
    ],
    tenant_settings: [
      { tenant_id: TENANT_A, store_status: 'open', markup_percent: 25 },
    ],
    bot_connections: [
      {
        id: BOT_A,
        tenant_id: TENANT_A,
        telegram_bot_id: '999',
        username: 'prince_store_bot',
        encrypted_token: encrypt('99999:RESELLERTOKEN'),
        webhook_secret: 'sec-a',
        status: 'connected',
        created_at: '2026-10-01T00:00:00.000Z',
        updated_at: '2026-10-10T00:00:00.000Z',
      },
    ],
    suppliers: [
      {
        id: SUP_ID,
        name: 'SecretUpstreamSupplier',
        slug: 'secret-upstream',
        status: 'active',
        balance_usdt: 999.5,
      },
    ],
    supplier_products: [
      {
        id: SUP_PROD_ID,
        supplier_id: SUP_ID,
        supplier_sku: 'SECRET-SUP-SKU',
        name: 'Secret Supplier Item',
        product_id: PROD_LISTED,
        in_stock: true,
        stock_count: 15,
      },
    ],
    products: [
      {
        id: PROD_LISTED,
        sku: 'SKU-LISTED',
        title: 'Gemini Pro 12M',
        description: 'Plan',
        category: 'AI',
        delivery_type: 'supplier_api',
        supplier_id: SUP_ID,
        supplier_sku: 'SECRET-SUP-SKU',
        supplier_price_minor: '1000000',
        status: 'published',
        wholesale_price: '2000000',
        retail_price: '3000000',
        stock_unlimited: false,
        stock_count: 15,
        reseller_eligible: true,
        max_purchase_qty: 5,
        version: 1,
        created_at: '2026-10-01T00:00:00.000Z',
        updated_at: '2026-10-01T00:00:00.000Z',
      },
      {
        id: PROD_OWNER_ONLY,
        sku: 'SKU-OWNER',
        title: 'Owner Secret Item',
        description: 'Private',
        category: 'VIP',
        delivery_type: 'manual',
        supplier_id: SUP_ID,
        supplier_sku: 'OWNER-ONLY-SKU',
        supplier_price_minor: '5000000',
        status: 'published',
        wholesale_price: '6000000',
        retail_price: '9000000',
        stock_unlimited: true,
        stock_count: null,
        reseller_eligible: false,
        max_purchase_qty: 5,
        version: 1,
        created_at: '2026-10-01T00:00:00.000Z',
        updated_at: '2026-10-01T00:00:00.000Z',
      },
    ],
    reseller_listings: [
      {
        id: LISTING_A,
        tenant_id: TENANT_A,
        product_id: PROD_LISTED,
        retail_price: '2500000',
        is_visible: true,
        price_override: false,
        created_at: '2026-10-01T00:00:00.000Z',
        updated_at: '2026-10-01T00:00:00.000Z',
      },
    ],
    customers: [
      {
        id: CUST_OWNER,
        bot_id: null,
        telegram_user_id: '1001',
        telegram_chat_id: '1001',
        username: 'ownerbuyer',
        first_name: 'OwnerBuyer',
        credit_balance: '10000000',
        is_blocked: false,
        created_at: '2026-10-05T00:00:00.000Z',
        updated_at: '2026-10-10T11:58:00.000Z',
      },
      {
        id: CUST_RESELLER,
        bot_id: BOT_A,
        telegram_user_id: '2002',
        telegram_chat_id: '2002',
        username: 'princebuyer',
        first_name: 'PrinceBuyer',
        credit_balance: '3000000',
        is_blocked: false,
        created_at: '2026-10-05T00:00:00.000Z',
        updated_at: '2026-10-10T11:58:00.000Z',
      },
    ],
    orders: [
      {
        id: ORD_OWNER,
        tenant_id: null,
        bot_id: null,
        channel: 'owner_store',
        customer_id: CUST_OWNER,
        product_id: PROD_OWNER_ONLY,
        product_version: 1,
        quantity: 1,
        quoted_retail_price: '9000000',
        quoted_wholesale_price: '6000000',
        payment_status: 'verified',
        funding_status: 'not_applicable',
        fulfillment_status: 'ready',
        delivery_status: 'sent',
        idempotency_key: 'k-owner',
        external_order_ref: 'REF-OWNER',
        created_at: '2026-10-09T10:00:00.000Z',
        updated_at: '2026-10-09T10:05:00.000Z',
      },
      {
        id: ORD_RESELLER,
        tenant_id: TENANT_A,
        bot_id: BOT_A,
        channel: 'reseller_bot',
        customer_id: CUST_RESELLER,
        product_id: PROD_LISTED,
        product_version: 1,
        quantity: 1,
        quoted_retail_price: '2500000',
        quoted_wholesale_price: '2000000',
        payment_status: 'verified',
        funding_status: 'debited',
        fulfillment_status: 'ready',
        delivery_status: 'sent',
        idempotency_key: 'k-reseller',
        external_order_ref: 'REF-PRINCE',
        created_at: '2026-10-09T12:00:00.000Z',
        updated_at: '2026-10-09T12:05:00.000Z',
      },
    ],
    fulfillment_attempts: [
      {
        id: 'att-res-1',
        order_id: ORD_RESELLER,
        attempt_number: 1,
        method: 'supplier',
        status: 'delivered',
        artifact_path: 'supplier_order:SECRET-UPSTREAM-999',
        started_at: '2026-10-09T12:00:10.000Z',
        completed_at: '2026-10-09T12:01:00.000Z',
        error: null,
      },
    ],
    support_threads: [
      {
        id: THREAD_OWNER,
        tenant_id: null,
        customer_id: CUST_OWNER,
        bot_id: null,
        status: 'open',
        unread_for_owner: true,
        last_message_at: '2026-10-10T10:00:00.000Z',
      },
    ],
    wallets: [
      {
        id: WALLET_A,
        tenant_id: TENANT_A,
        balance_available: '12000000',
        balance_reserved: '2000000',
        balance_total: '14000000',
        status: 'active',
        updated_at: '2026-10-10T00:00:00.000Z',
      },
      {
        id: WALLET_B,
        tenant_id: TENANT_B,
        balance_available: '80000000',
        balance_reserved: '0',
        balance_total: '80000000',
        status: 'active',
        updated_at: '2026-10-10T00:00:00.000Z',
      },
    ],
    ledger_transactions: [
      {
        id: 'led-a',
        wallet_id: WALLET_A,
        entry_type: 'top_up_credit',
        amount: '14000000',
        note: 'Top up A',
        created_at: '2026-10-08T00:00:00.000Z',
      },
      {
        id: 'led-b',
        wallet_id: WALLET_B,
        entry_type: 'top_up_credit',
        amount: '80000000',
        note: 'Top up B',
        created_at: '2026-10-08T00:00:00.000Z',
      },
    ],
  });
}

describe('Phase M — Strict reseller isolation', () => {
  it('isolates overview and today stats for resellers (and suppresses live counts when botId is null)', async () => {
    const db = buildFixtureDb();
    const now = new Date('2026-10-10T12:00:00.000Z');

    const overview = await readOverview(
      db,
      { role: 'reseller', tenantId: TENANT_A, botId: BOT_A, firstName: 'Prince' },
      '7d',
      now,
    );
    expect(overview.revenue).toBe('2.50 USDT');
    expect(overview.resellers).toEqual([]);
    expect(overview.products.map((p) => p.id)).toEqual([PROD_LISTED]);
    expect(overview.live).toBe(1);
    expect(overview.sales.map((s) => s.id)).toEqual([ORD_RESELLER]);

    const noBotOverview = await readOverview(
      db,
      { role: 'reseller', tenantId: TENANT_A, botId: null, firstName: 'Prince' },
      '7d',
      now,
    );
    expect(noBotOverview.live).toBe(0);

    const noBotToday = await readToday(db, { role: 'reseller', tenantId: TENANT_A, botId: null });
    expect(noBotToday.day.newBuyers).toBe(0);
    expect(noBotToday.items).toEqual([]);
  });

  it('hides upstream supplier names, raw supplier SKUs, and owner-only products in catalog, inventory & pricing', async () => {
    const db = buildFixtureDb();

    const catalog = await readCatalog(
      db,
      { role: 'reseller', tenantId: TENANT_A },
      parseCatalogFilters(new URLSearchParams()),
    );
    expect(catalog.rows).toHaveLength(1);
    expect(catalog.rows[0]?.productId).toBe(PROD_LISTED);
    expect(catalog.rows[0]?.supplierName).toBe('Platform catalog');
    expect(catalog.rows[0]?.supplierId).toBeNull();
    expect(catalog.summary.supplierCount).toBe(0);
    expect(JSON.stringify(catalog)).not.toContain('SecretUpstreamSupplier');

    const detail = await readCatalogDetail(db, PROD_LISTED, TENANT_A);
    expect(detail.row.supplierName).toBe('Platform catalog');
    expect(detail.history.map((h) => h.id)).toEqual([ORD_RESELLER]);

    // Raw supplier_products ID and unlisted owner product must return 404
    await expect(readCatalogDetail(db, SUP_PROD_ID, TENANT_A)).rejects.toMatchObject({ statusCode: 404 });
    await expect(readCatalogDetail(db, PROD_OWNER_ONLY, TENANT_A)).rejects.toMatchObject({ statusCode: 404 });

    const inv = await readInventory(db, { role: 'reseller', tenantId: TENANT_A }, false);
    expect(inv.rows).toHaveLength(1);
    expect(inv.rows[0]?.supplierName).toBe('Platform catalog');
    expect(JSON.stringify(inv)).not.toContain('SecretUpstreamSupplier');

    const pricing = await readPricing(db, { role: 'reseller', tenantId: TENANT_A });
    expect(pricing.role).toBe('reseller');
    expect(pricing.retailValue).toBe('25');
    expect(pricing.defaultCount).toBe(1);
    expect(pricing.defaultPreview[0]?.fromWholesale).toBe('2');
    expect(pricing.defaultPreview[0]?.toRetail).toBe('2.5');
    expect(JSON.stringify(pricing)).not.toContain('Owner Secret Item');
  });

  it('isolates order search & order detail, hiding supplier internals and rejecting foreign orders with 403', async () => {
    const db = buildFixtureDb();

    const listed = await readOrders(db, TENANT_A, parseOrderFilters(new URLSearchParams('q=REF')));
    expect(listed.rows.map((r) => r.id)).toEqual([ORD_RESELLER]);
    // Reseller must see their wholesale cost, never upstream supplier_price_minor
    expect(listed.rows[0]?.supplierCostMinor).toBe('2000000');

    mockRequireRole.mockResolvedValue({
      user: { id: RESELLER_USER },
      profile: { role: 'reseller' },
      admin: db,
    });

    const ownRes = await orderDetailGet(new Request('http://localhost'), { params: { orderId: ORD_RESELLER } });
    expect(ownRes.status).toBe(200);
    const ownText = await ownRes.text();
    expect(ownText).toContain('Platform catalog');
    expect(ownText).not.toContain('SecretUpstreamSupplier');
    expect(ownText).not.toContain('SECRET-SUP-SKU');
    expect(ownText).not.toContain('SECRET-UPSTREAM-999');
    expect(JSON.parse(ownText).data).toMatchObject({
      canReplaceFromSupplier: false,
      product: { supplierSku: null, sourceLabel: 'Platform catalog' },
      fulfillmentAttempt: { artifactPath: null },
    });

    const foreignRes = await orderDetailGet(new Request('http://localhost'), { params: { orderId: ORD_OWNER } });
    expect(foreignRes.status).toBe(403);
  });

  it('blocks reseller with null botId or null tenantId from accessing owner buyers, bots, wallets, or support threads', async () => {
    const db = buildFixtureDb();

    // Even when botId is null, readPerson MUST NOT match owner buyer with bot_id=null
    const nullBotPerson = await readPerson(db, {
      id: CUST_OWNER,
      kind: 'buyer',
      role: 'reseller',
      tenantId: TENANT_A,
      botId: null,
    });
    expect(nullBotPerson).toBeNull();

    // Even when tenantId is null, support must NOT match owner thread with tenant_id=null
    const nullTenantThread = await readSupportThread(db, THREAD_OWNER, { owner: false, tenantId: null });
    expect(nullTenantThread.thread).toBeNull();

    await expect(
      setSupportThreadStatus(db, {
        threadId: THREAD_OWNER,
        status: 'closed',
        scope: { owner: false, tenantId: null },
        actorId: RESELLER_USER,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    // Reseller bots desk returns only their bot and orders
    const bots = await readBots(db, 'reseller', TENANT_A);
    expect(bots.bots.map((b) => b.id)).toEqual([BOT_A]);
    const ownDetail = await readBotDetail(db, 'reseller', TENANT_A, BOT_A);
    expect(ownDetail?.ordersList.map((o) => o.id)).toEqual([ORD_RESELLER]);
    expect(ownDetail?.buyersList.map((b) => b.id)).toEqual([CUST_RESELLER]);
    expect(await readBotDetail(db, 'reseller', TENANT_A, 'owner')).toBeNull();

    // Reseller money sees only their own wallet and ledger (never TENANT_B or owner suppliers)
    const money = await readMoney(db, { role: 'reseller', tenantId: TENANT_A });
    expect(money.suppliers).toEqual([]);
    expect(money.wallets.map((w) => w.id)).toEqual([WALLET_A]);
    expect(money.ledger.map((l) => l.id)).toEqual(['led-a']);
  });
});
