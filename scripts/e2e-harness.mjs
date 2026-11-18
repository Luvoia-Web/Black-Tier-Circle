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
  '/overview', '/analytics', '/intelligence', '/remy', '/orders', '/catalog',
  '/catalog?stock=out', '/suppliers/health', '/people?type=buyer', '/people?type=reseller',
  '/money', '/store', '/growth', '/settings', '/health',
];

const resellerPaths = ['/overview', '/analytics', '/remy', '/orders', '/catalog', '/people', '/growth', '/money', '/store', '/settings'];

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

async function magicLink(admin, email) {
  const generated = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${base}/auth/callback` },
  });
  const link = generated.data?.properties?.action_link;
  if (!link || generated.error) {
    throw new Error('Could not create a sign-in link');
  }
  return link;
}

async function signIn(browser, link, file) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(link, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForURL(/\/(overview|today|onboarding|login)/, { timeout: 20000 });
  await context.storageState({ path: file });
  await context.close();
}

function assertClean(body, errors) {
  const problems = [];
  if (/<(b|i|br|strong|em|code)\b/i.test(body)) problems.push('raw HTML tag');
  if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(body)) problems.push('raw ISO timestamp');
  if (/Something went wrong|This is taking too long|Unable to load/i.test(body)) problems.push('error state');
  if (/Loading…|Loading balances|Loading codes/.test(body)) problems.push('stuck loading');
  if (errors.length > 0) problems.push(`console: ${errors.slice(0, 2).join(' | ')}`);
  return problems;
}

async function shoot(browser, storage, label, paths) {
  const context = await browser.newContext({ storageState: storage });
  const results = [];
  for (const target of paths) {
    for (const width of [1440, 390]) {
      const page = await context.newPage();
      const logs = [];
      page.on('console', (message) => {
        if (message.type() === 'error') logs.push(message.text().slice(0, 180));
      });
      page.on('pageerror', (error) => logs.push(error.message.slice(0, 180)));
      const viewport = { width, height: width === 390 ? 844 : 900 };
      await page.setViewportSize(viewport);
      const response = await page.goto(`${base}${target}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => null);
      await page.waitForTimeout(1500);
      const body = await page.locator('body').innerText().catch(() => '');
      const status = response ? response.status() : 0;
      const problems = status >= 400 ? [`HTTP ${status}`] : assertClean(body, logs);
      const slug = `${label}-${target.replace(/[/?=&]/g, '-')}-${width}`;
      await page.screenshot({ path: path.join(shotDir, `${slug}.png`), fullPage: true });
      results.push({ target, width, pass: problems.length === 0, problems });
      await page.close();
    }
  }
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
    await signIn(browser, await magicLink(admin, ownerEmail), path.join(outDir, 'owner.json'));

    const resellers = await admin.from('profiles').select('id').eq('role', 'reseller').eq('status', 'active').limit(1);
    let resellerReady = false;
    if (resellers.data?.[0]) {
      const resellerUser = await admin.auth.admin.getUserById(resellers.data[0].id);
      const resellerEmail = resellerUser.data.user?.email;
      if (resellerEmail) {
        await signIn(browser, await magicLink(admin, resellerEmail), path.join(outDir, 'reseller.json'));
        resellerReady = true;
      }
    }
    if (!resellerReady) {
      await writeFile(path.join(outDir, 'reseller.txt'), 'No active reseller.\n');
      console.log('No active reseller.');
    }

    const results = [
      ...(await shoot(browser, path.join(outDir, 'owner.json'), 'owner', ownerPaths)),
    ];
    if (resellerReady) {
      results.push(...(await shoot(browser, path.join(outDir, 'reseller.json'), 'reseller', resellerPaths)));
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
  console.error(error instanceof Error ? error.message : 'Harness failed');
  process.exit(1);
});
