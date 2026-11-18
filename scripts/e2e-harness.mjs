/**
 * Signed-in screenshot harness.
 * Builds the app, starts it, signs in with a magic link, and visits every sidebar page.
 * Never prints the link, the token, or the contents of .env.local.
 */

import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const root = process.cwd();
const base = 'http://127.0.0.1:3210';
const outDir = path.join(root, '.cursor', 'e2e');
const shotDir = path.join(outDir, 'shots');

const ownerPaths = [
  '/orders',
  '/orders?chip=all',
  '/orders?chip=attention',
  '/orders?chip=awaiting',
  '/orders?chip=fulfilling',
  '/orders?chip=delivered',
  '/orders?chip=failed',
  '/orders?chip=expired',
  '/orders?attention=fulfillment',
  '/orders?attention=delivery',
  '/catalog',
  '/catalog?section=inventory',
  '/catalog?section=pricing',
  '/catalog?section=suppliers&panel=connected',
  '/catalog?section=suppliers&panel=import',
  '/catalog?section=suppliers&panel=orders',
  '/catalog?section=suppliers&panel=health',
  '/catalog?section=suppliers&connect=1',
];

const resellerPaths = [
  '/orders',
  '/orders?chip=all',
  '/orders?chip=attention',
  '/orders?chip=awaiting',
  '/orders?chip=fulfilling',
  '/orders?chip=delivered',
  '/orders?chip=failed',
  '/orders?chip=expired',
  '/orders?attention=delivery',
  '/catalog',
  '/catalog?section=inventory',
  '/catalog?section=pricing',
];

function loadEnv(text) {
  const env = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).replace(/^["']|["']$/g, '');
  }
  return env;
}

async function signIn(browser, admin, email, file) {
  const generated = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${base}/auth/callback` },
  });
  const tokenHash = generated.data?.properties?.hashed_token;
  if (!tokenHash || generated.error) {
    throw new Error('Could not create a sign-in link');
  }
  const context = await browser.newContext({ colorScheme: 'dark' });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('btc-theme', 'dark');
    localStorage.setItem('btc-theme-v', '2');
  });
  await page.goto(`${base}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(500);
  const landed = new URL(page.url());
  if (!/\/(overview|today|onboarding)/.test(landed.pathname)) {
    const reason = landed.searchParams.get('reason') || landed.searchParams.get('error') || landed.pathname;
    await context.close();
    throw new Error(`Sign-in did not reach the dashboard (${reason})`);
  }
  await context.storageState({ path: file });
  await context.close();
}

function assertClean(body, errors, extra) {
  const problems = [...extra];
  if (/<(b|i|br|strong|em|code)\b/i.test(body)) problems.push('raw HTML tag');
  if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(body)) problems.push('raw ISO timestamp');
  if (/Something went wrong|This is taking too long|Unable to load/i.test(body)) problems.push('error state');
  if (/Loading…|Loading balances|Loading codes/.test(body)) problems.push('stuck loading');
  if (errors.length > 0) problems.push(`console: ${errors.slice(0, 2).join(' | ')}`);
  return problems;
}

async function openPage(context, width) {
  const page = await context.newPage();
  const logs = [];
  const failedNetwork = [];
  const networkReads = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') logs.push(message.text().replace(/https?:\/\/\S+/g, '[url]').slice(0, 160));
  });
  page.on('pageerror', (error) => logs.push(error.message.slice(0, 160)));
  page.on('response', (response) => {
    const status = response.status();
    if (status < 400) return;
    const url = new URL(response.url());
    if (url.pathname === '/favicon.ico') return;
    networkReads.push((async () => {
      let detail = '';
      if (url.pathname.startsWith('/api/')) {
        const text = await response.text().catch(() => '');
        const match = text.match(/"detail":"([^"]{0,220})"/);
        detail = match?.[1] ? ` ${match[1]}` : '';
      }
      failedNetwork.push(`${status} ${url.pathname}${detail}`);
    })());
  });
  await page.addInitScript(() => {
    localStorage.setItem('btc-theme', 'dark');
    localStorage.setItem('btc-theme-v', '2');
  });
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  return { page, logs, failedNetwork, networkReads };
}

async function record(page, label, target, width, logs, failedNetwork, networkReads = []) {
  await page.waitForTimeout(1200);
  await Promise.all(networkReads);
  const body = await page.locator('body').innerText().catch(() => '');
  const wide = width === 390
    ? await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1).catch(() => false)
    : false;
  const extra = [];
  if (wide) extra.push('horizontal scroll');
  if (failedNetwork.length > 0) extra.push(`network: ${failedNetwork.slice(0, 3).join(', ')}`);
  const problems = assertClean(body, logs, extra);
  const slug = `${label}-${target.replace(/[/?=&]/g, '-')}-${width}`;
  await page.screenshot({ path: path.join(shotDir, `${slug}.png`), fullPage: false });
  return { target, width, pass: problems.length === 0, problems };
}

async function shoot(browser, storage, label, paths) {
  const context = await browser.newContext({ storageState: storage, colorScheme: 'dark' });
  const results = [];
  for (const target of paths) {
    for (const width of [1440, 390]) {
      const opened = await openPage(context, width);
      const response = await opened.page.goto(`${base}${target}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
      const status = response ? response.status() : 0;
      if (status >= 400) {
        results.push({ target, width, pass: false, problems: [`HTTP ${status}`] });
        await opened.page.close();
        continue;
      }
      results.push(await record(opened.page, label, target, width, opened.logs, opened.failedNetwork, opened.networkReads));
      await opened.page.close();
    }
  }
  await context.close();
  return results;
}

async function commerceFlows(browser, storage, label, owner) {
  const context = await browser.newContext({ storageState: storage, colorScheme: 'dark' });
  const results = [];
  const opened = await openPage(context, 1440);
  const page = opened.page;
  await page.goto(`${base}/orders?chip=failed`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1200);
  const failedButton = page.locator('table tbody tr').first().locator('button').first();
  if (await failedButton.count()) {
    await failedButton.click();
    await page.waitForTimeout(800);
  }
  results.push(await record(page, label, 'orders-drawer-failed', 1440, opened.logs, opened.failedNetwork, opened.networkReads));
  await page.goto(`${base}/orders?chip=delivered`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1000);
  const deliveredButton = page.locator('table tbody tr').first().locator('button').first();
  if (await deliveredButton.count()) {
    await deliveredButton.click();
    await page.waitForTimeout(800);
  }
  results.push(await record(page, label, 'orders-drawer-delivered', 1440, opened.logs, opened.failedNetwork, opened.networkReads));
  const orderUrl = new URL(page.url());
  const orderId = orderUrl.searchParams.get('order');

  await page.evaluate(() => localStorage.setItem('btc-catalog-layout', 'grid'));
  await page.goto(`${base}/catalog`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1000);
  const boxes = page.locator('article input[type="checkbox"]');
  const boxCount = await boxes.count();
  for (let index = 0; index < Math.min(3, boxCount); index += 1) await boxes.nth(index).check();
  await page.waitForTimeout(300);
  results.push(await record(page, label, 'catalog-grid-bulk', 1440, opened.logs, opened.failedNetwork, opened.networkReads));
  await page.evaluate(() => localStorage.setItem('btc-catalog-layout', 'list'));
  await page.goto(`${base}/catalog`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1000);
  results.push(await record(page, label, 'catalog-list', 1440, opened.logs, opened.failedNetwork, opened.networkReads));
  const card = page.locator('table tbody tr, article').first();
  if (await card.count()) {
    const opener = card.locator('button').first();
    if (await opener.count()) await opener.click();
    await page.waitForTimeout(800);
  }
  results.push(await record(page, label, 'catalog-drawer', 1440, opened.logs, opened.failedNetwork, opened.networkReads));
  const itemId = new URL(page.url()).searchParams.get('item');
  if (itemId) {
    await page.goto(`${base}/catalog?item=${itemId}&edit=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    results.push(await record(page, label, 'catalog-editor', 1440, opened.logs, opened.failedNetwork, opened.networkReads));
  }
  await page.goto(`${base}/catalog?create=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  results.push(await record(page, label, 'catalog-create', 1440, opened.logs, opened.failedNetwork, opened.networkReads));

  let supplierId = null;
  if (owner) {
    await page.goto(`${base}/catalog?section=suppliers&panel=connected`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(800);
    const supplierLink = page.locator('a[href*="supplier="]').first();
    if (await supplierLink.count()) {
      const href = await supplierLink.getAttribute('href');
      supplierId = href ? new URL(href, base).searchParams.get('supplier') : null;
    }
    if (supplierId) {
      await page.goto(`${base}/catalog?section=suppliers&supplier=${supplierId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      results.push(await record(page, label, 'catalog-supplier', 1440, opened.logs, opened.failedNetwork, opened.networkReads));
    }
  }

  const rules = JSON.parse(await readFile(path.join(root, 'lib', 'legacy-redirects.json'), 'utf8'));
  const sampleOrder = orderId || '00000000-0000-4000-8000-000000000001';
  const sampleItem = itemId || sampleOrder;
  const sampleSupplier = supplierId || sampleOrder;
  const redirects = rules.filter((rule) => /\/(orders|catalog)/.test(rule.destination));
  for (const rule of redirects) {
    if (!owner && rule.source.startsWith('/owner')) continue;
    if (owner && rule.source.startsWith('/reseller')) continue;
    const source = rule.source
      .replace(':orderId', sampleOrder)
      .replace(':productId', sampleItem)
      .replace(':supplierId', sampleSupplier);
    const response = await page.goto(`${base}${source}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
    const status = response ? response.status() : 0;
    const landed = new URL(page.url());
    const expected = rule.destination.split('?')[0];
    const problems = [];
    if (status >= 400) problems.push(`HTTP ${status}`);
    if (!landed.pathname.startsWith(expected)) problems.push(`landed ${landed.pathname}`);
    results.push({ target: `redirect ${source}`, width: 1440, pass: problems.length === 0, problems });
  }
  await page.close();
  await context.close();
  return results;
}

async function main() {
  const env = loadEnv(await readFile(path.join(root, '.env.local'), 'utf8'));
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase admin credentials are missing');
  await mkdir(shotDir, { recursive: true });

  const build = spawn('./node_modules/.bin/next', ['build'], { cwd: root, stdio: 'inherit' });
  const built = await new Promise((resolve) => build.on('exit', resolve));
  if (built !== 0) throw new Error('next build failed');

  const server = spawn('./node_modules/.bin/next', ['start', '-p', '3210'], { cwd: root, stdio: 'ignore' });
  try {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        const ping = await fetch(`${base}/api/health`);
        if (ping.ok || ping.status === 401 || ping.status === 200) break;
      } catch {
        // The server is still starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const admin = createClient(url, key, { auth: { persistSession: false } });
    const owners = await admin.from('profiles').select('id').eq('role', 'owner').limit(1);
    if (!owners.data?.[0]) throw new Error('No owner profile');
    const ownerUser = await admin.auth.admin.getUserById(owners.data[0].id);
    const ownerEmail = ownerUser.data.user?.email;
    if (!ownerEmail) throw new Error('Owner has no email');

    const browser = await chromium.launch();
    await signIn(browser, admin, ownerEmail, path.join(outDir, 'owner.json'));

    const resellers = await admin.from('profiles').select('id').eq('role', 'reseller').eq('status', 'active').limit(1);
    let resellerReady = false;
    if (resellers.data?.[0]) {
      const resellerUser = await admin.auth.admin.getUserById(resellers.data[0].id);
      const resellerEmail = resellerUser.data.user?.email;
      if (resellerEmail) {
        await signIn(browser, admin, resellerEmail, path.join(outDir, 'reseller.json'));
        resellerReady = true;
      }
    }
    if (!resellerReady) {
      await writeFile(path.join(outDir, 'reseller.txt'), 'No active reseller.\n');
      console.log('No active reseller.');
    }

    const results = [
      ...(await shoot(browser, path.join(outDir, 'owner.json'), 'owner', ownerPaths)),
      ...(await commerceFlows(browser, path.join(outDir, 'owner.json'), 'owner', true)),
    ];
    if (resellerReady) {
      results.push(...(await shoot(browser, path.join(outDir, 'reseller.json'), 'reseller', resellerPaths)));
      results.push(...(await commerceFlows(browser, path.join(outDir, 'reseller.json'), 'reseller', false)));
    }
    await browser.close();
    await writeFile(path.join(outDir, 'report.json'), JSON.stringify(results, null, 2));
    const failed = results.filter((row) => !row.pass);
    for (const row of results) {
      console.log(`${row.pass ? 'PASS' : 'FAIL'} ${row.target} ${row.width}${row.pass ? '' : ` — ${row.problems.join(', ')}`}`);
    }
    if (failed.length > 0) process.exitCode = 1;
  } finally {
    server.kill('SIGTERM');
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Harness failed';
  console.error(message.replace(/token_hash=[^&\s]+/g, 'token_hash=redacted').replace(/eyJ[A-Za-z0-9._-]+/g, '[redacted]'));
  process.exit(1);
});
