import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const freshStartPath = path.join(process.cwd(), 'scripts', 'sql', 'fresh-start.sql');
const undoPath = path.join(process.cwd(), 'scripts', 'sql', 'fresh-start-undo.sql');

describe('Phase N — fresh-start.sql and fresh-start-undo.sql safety invariants', () => {
  const sql = readFileSync(freshStartPath, 'utf8');
  const undo = readFileSync(undoPath, 'utf8');

  it('creates temp tables on commit drop and scopes every tenant-owned delete to resellers only', () => {
    expect(sql).toMatch(/create temp table _reseller_profiles on commit drop/i);
    expect(sql).toMatch(/create temp table _reseller_tenants on commit drop/i);

    const scopedTables = [
      'api_keys',
      'webhook_endpoints',
      'tenant_settings',
      'wallets',
      'bot_connections',
      'topup_tokens',
      'store_config',
      'store_config_versions',
      'broadcasts',
    ];
    for (const table of scopedTables) {
      // Must NOT have an unscoped delete
      expect(sql).not.toMatch(new RegExp(`delete\\s+from\\s+public\\.${table}\\s*;`, 'i'));
      // Must have a delete scoped to _reseller_tenants
      expect(sql).toMatch(
        new RegExp(`delete\\s+from\\s+public\\.${table}\\s+where\\s+tenant_id\\s+in\\s*\\(select\\s+id\\s+from\\s+_reseller_tenants\\)`, 'i'),
      );
    }
  });

  it('previews kept owner rows and positive wallets in Part 1', () => {
    expect(sql).toMatch(/kept_relation/i);
    expect(sql).toMatch(/where credit_balance > 0/i);
    expect(sql).toMatch(/where w\.balance_total > 0/i);
  });

  it('deletes reseller discount codes without moving them to owner and resets owner used_count', () => {
    expect(sql).toMatch(/delete from public\.discount_codes\s+where tenant_id in \(select id from _reseller_tenants\)/i);
    expect(sql).not.toMatch(/update public\.discount_codes[^;]*?set tenant_id = null/i);
    expect(sql).toMatch(/update public\.discount_codes\s+set used_count = 0/i);
  });

  it('backs up and deletes notifications and invitations, and never touches storage.objects', () => {
    expect(sql).toMatch(/create table fresh_start_backup\.notifications/i);
    expect(sql).toMatch(/create table fresh_start_backup\.invitations/i);
    expect(sql).toMatch(/delete from public\.notifications;/i);
    expect(sql).toMatch(/delete from public\.invitations;/i);

    expect(sql).not.toMatch(/delete from storage\.objects/i);
    expect(sql).not.toMatch(/fresh_start_backup\.storage_objects/i);
    expect(sql).toMatch(/product-files/i);
    expect(sql).toMatch(/product-previews/i);

    expect(undo).not.toMatch(/storage\.objects/i);
  });

  it('restores customers in two steps in undo and restores broadcasts, notifications, and invitations', () => {
    expect(undo).toMatch(/update _restore_customers set referred_by_customer_id = null;/i);
    expect(undo).toMatch(/update public\.customers c\s+set referred_by_customer_id = b\.referred_by_customer_id/i);
    expect(undo).toMatch(/insert into public\.broadcasts/i);
    expect(undo).toMatch(/insert into public\.notifications/i);
    expect(undo).toMatch(/insert into public\.invitations/i);
  });
});
