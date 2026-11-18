import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/lib/errors';
import { parseOrderFilters } from '@/modules/platform/orders';
import { ownerReplace } from '@/modules/platform/replacements';
import { DEFAULT_STORE_CONFIG } from '@/modules/store-config/defaults';
import { layoutHomeButtons } from '@/modules/store-config/keyboard';
import { createMemoryDb } from '@/tests/fixtures/fake-supabase';

const ORDER = '00000000-0000-4000-8000-000000000901';
const CUSTOMER = '00000000-0000-4000-8000-000000000902';
const ACTOR = '00000000-0000-4000-8000-000000000903';

describe('order filters', () => {
  it('reads attention, chip, and range', () => {
    const filters = parseOrderFilters(new URLSearchParams('attention=delivery&chip=failed&range=7d&q=a.b'));
    expect(filters.attention).toBe('delivery');
    expect(filters.chip).toBe('failed');
    expect(filters.range).toBe('7d');
    expect(filters.search).toBe('ab');
  });

  it('ignores an unknown attention value', () => {
    expect(parseOrderFilters(new URLSearchParams('attention=nope')).attention).toBe('');
  });
});

describe('owner replacement', () => {
  function db() {
    return createMemoryDb({
      orders: [{ id: ORDER, customer_id: CUSTOMER, tenant_id: null, delivery_status: 'sent' }],
      replacement_requests: [],
      order_events: [],
      audit_log: [],
      support_threads: [{ id: '00000000-0000-4000-8000-000000000904', customer_id: CUSTOMER, status: 'open', last_message_at: '2026-01-01T00:00:00.000Z' }],
      support_messages: [],
    });
  }

  it('approves, retries, marks replaced, audits, and posts to the open thread', async () => {
    const database = db();
    const calls: string[] = [];
    const result = await ownerReplace(database, { orderId: ORDER, actorId: ACTOR, reason: 'File did not open' }, async (_db, orderId) => {
      calls.push(orderId);
    });
    expect(calls).toEqual([ORDER]);
    expect(result.support).toBe('posted');
    expect(database.tables.replacement_requests?.[0]?.status).toBe('replaced');
    expect(database.tables.orders?.[0]?.delivery_status).toBe('retry_pending');
    expect(database.tables.audit_log?.[0]?.actor_id).toBe(ACTOR);
    expect(database.tables.support_messages).toHaveLength(1);
  });

  it('refuses a second open replacement', async () => {
    const database = db();
    database.tables.replacement_requests?.push({ id: '00000000-0000-4000-8000-000000000905', order_id: ORDER, status: 'approved' });
    await expect(ownerReplace(database, { orderId: ORDER, actorId: ACTOR }, async () => undefined)).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects the row when retry fails so another attempt can be made', async () => {
    const database = db();
    await expect(ownerReplace(database, { orderId: ORDER, actorId: ACTOR }, async () => {
      throw new ValidationError('RETRY_FAILED', 'Delivery could not be retried.');
    })).rejects.toBeInstanceOf(ValidationError);
    expect(database.tables.replacement_requests?.[0]?.status).toBe('rejected');
  });
});

describe('buyer replace button', () => {
  it('stays off the home keyboard even when the stored button is enabled', () => {
    const rows = layoutHomeButtons(
      {
        ...DEFAULT_STORE_CONFIG,
        buttons: {
          ...DEFAULT_STORE_CONFIG.buttons,
          replace: { ...DEFAULT_STORE_CONFIG.buttons.replace, enabled: true },
        },
      },
      { resellerSignupEnabled: false },
    );
    expect(rows.flat().some((button) => button.text.includes('Replace') || ('data' in button && button.data === 'replace:'))).toBe(false);
  });
});
