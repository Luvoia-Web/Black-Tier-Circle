/**
 * @file scripts/seed-owner.ts
 *
 * Idempotent owner bootstrap: creates the Auth user and profile row.
 *
 * Usage: npm run seed:owner
 *
 * @module Scripts
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { getOrCreateProfile } from '@/modules/identity';
import type { DbClient } from '@/lib/supabase/query';

function loadEnvFile(fileName: string): void {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) {
    return;
  }
  for (const rawLine of readFileSync(filePath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }
    const separator = line.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

function asDbClient(client: ReturnType<typeof createAdminSupabaseClient>): DbClient {
  return client as unknown as DbClient;
}

async function findUserIdByEmail(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  email: string,
): Promise<string | null> {
  const perPage = 200;
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message);
    }
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) {
      return match.id;
    }
    if (data.users.length < perPage) {
      return null;
    }
    page += 1;
  }
}

async function seedOwner(): Promise<void> {
  const email = process.env.OWNER_EMAIL;
  const password = process.env.OWNER_PASSWORD;
  if (!email || !password) {
    throw new Error('OWNER_EMAIL and OWNER_PASSWORD must be set');
  }

  const admin = createAdminSupabaseClient();
  const existingId = await findUserIdByEmail(admin, email);
  let userId = existingId;
  let createdUser = false;

  if (userId === null) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: 'owner' },
      user_metadata: { display_name: 'Owner' },
    });
    if (error || data.user === null) {
      throw new Error(error?.message ?? 'Failed to create owner user');
    }
    userId = data.user.id;
    createdUser = true;
    console.info(`[seed:owner] created auth user ${email}`);
  } else {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { role: 'owner' },
      user_metadata: { display_name: 'Owner' },
    });
    if (error) {
      throw new Error(error.message);
    }
    console.info(`[seed:owner] auth user already exists for ${email}; metadata refreshed`);
  }

  await getOrCreateProfile(asDbClient(admin), userId, {
    displayName: 'Owner',
    role: 'owner',
    status: 'active',
  });
  const { error: profileError } = await admin
    .from('profiles')
    .update({
      role: 'owner',
      status: 'active',
      display_name: 'Owner',
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', userId);
  if (profileError) {
    throw new Error(profileError.message);
  }

  console.info(
    `[seed:owner] profile ready (role=owner, status=active)${createdUser ? '' : ' — existing profile updated'}`,
  );
  console.info('[seed:owner] done');
}

seedOwner().catch((error: unknown) => {
  console.error('[seed:owner] failed', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
