/**
 * Page proof. Signs in as the owner and as a reseller, opens every platform
 * route at desktop and phone width, and writes .cursor/page-audit.md.
 * Read-only: it never submits a form and never clicks a destructive control.
 * It does not print tokens, cookies, or .env.local.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { duplicatePaths, routesFor } from '../components/platform/nav-manifest.mjs';

const homeBrowsers = path.join(homedir(), 'Library', 'Caches', 'ms-playwright');
const currentBrowsers = process.env.PLAYWRIGHT_BROWSERS_PATH;
const currentReady = currentBrowsers && existsSync(path.join(currentBrowsers, 'chromium_headless_shell-1148'));
if (!currentReady && existsSync(homeBrowsers)) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = homeBrowsers;
}
const { chromium } = await import('playwright');

const root = process.cwd();
const port = process.env.CHECK_PAGES_PORT || '3210';
const base = `http://127.0.0.1:${port}`;
const auditPath = path.join(root, '.cursor', 'page-audit.md');
const logPath = path.join(root, '.cursor', 'e2e', 'check-pages-server.log');

const shotDir = path.join(root, '.cursor', 'e2e', 'shots');

const ownerRoutes = routesFor('owner');
const resellerRoutes = routesFor('reseller');

const SKIP_CONTROL = /delete|disconnect|revoke|pause|resume|connect|sync|publish|save|send|rotate|credit|debit|approve|reject|decline|suspend|reactivate|refund|complete|fail|resubmit|reconcile|archive|restore|ban\b|block|unblock|close thread|reopen thread|replace|prepare replacement|confirm replace|create invite|reset override|create token|redeem|override|confirm override|sign out|log out|switch theme|decrease|increase|webhook|invite|retry|confirm retry|apply|cancel|verify|note|rename|reprice|export|download|broadcast|turn on|turn off|add code|save code|update code|edit code|schedule broadcast|confirm send|review send|cancel broadcast|update points|add freebie|activate|deactivate|move up|remove chat|test key|mark /i;

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

function problemsIn(body, errors, failedNetwork) {
  const problems = [];
  if (/Something went wrong/i.test(body)) problems.push('error boundary');
  if (/The request failed \(\d+\)/i.test(body)) problems.push('unparseable or failed request');
  if (/arrives in a later step|later step|full layout|coming soon|full charts arrive/i.test(body)) problems.push('placeholder text');
  if (/<\/?[a-z][^>\n]{0,40}>/i.test(body)) problems.push('raw HTML tag');
  if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(body)) problems.push('raw ISO timestamp');
  const cleaned = body
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\S+@\S+/g, ' ')
    .replace(/@[a-zA-Z0-9_]+/g, ' ')
    .replace(/\{[a-zA-Z0-9_]+\}/g, ' ');
  const snakeMatches = cleaned.match(/\b[a-z]{2,}_[a-z0-9_]{2,}\b/g);
  if (snakeMatches && snakeMatches.length > 0) {
    const sample = [...new Set(snakeMatches)].slice(0, 4).join(', ');
    problems.push(`raw snake_case (${sample})`);
  }
  if (/Loading…|Loading balances|Loading codes/.test(body)) problems.push('stuck loading');
  if (/Powered by Claude/i.test(body)) problems.push('stale Claude branding');
  if (errors.length > 0) problems.push(`console: ${errors.slice(0, 3).join(' | ')}`);
  if (failedNetwork.length > 0) problems.push(`network: ${failedNetwork.slice(0, 3).join(', ')}`);
  return problems;
}

async function layoutProblem(page) {
  const result = await page.evaluate(() => {
    const docWidth = document.documentElement.clientWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const overflow = scrollWidth > docWidth + 1 ? `${scrollWidth} > ${docWidth}` : null;
    const header = document.querySelector('header');
    let overlap = null;
    if (header && docWidth <= 420) {
      const items = [...header.querySelectorAll('button, a')].filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      for (let i = 0; i < items.length; i += 1) {
        const a = items[i].getBoundingClientRect();
        for (let j = i + 1; j < items.length; j += 1) {
          const b = items[j].getBoundingClientRect();
          if (a.right > b.left + 1 && a.left < b.right - 1 && a.bottom > b.top + 1 && a.top < b.bottom - 1) {
            const labelA = items[i].getAttribute('aria-label') || items[i].textContent?.trim() || 'control';
            const labelB = items[j].getAttribute('aria-label') || items[j].textContent?.trim() || 'control';
            overlap = `${labelA} overlaps ${labelB}`;
            break;
          }
        }
        if (overlap) break;
      }
    }
    return { overflow, overlap };
  });
  const issues = [];
  if (result.overflow) issues.push(`horizontal overflow (${result.overflow})`);
  if (result.overlap) issues.push(`top bar ${result.overlap}`);
  return issues;
}

function attach(page) {
  const logs = [];
  const failedNetwork = [];
  const pending = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text().replace(/https?:\/\/\S+/g, '[url]').slice(0, 180);
    if (/favicon|Download the React DevTools|ResizeObserver/i.test(text)) return;
    logs.push(text);
  });
  page.on('pageerror', (error) => logs.push(error.message.replace(/https?:\/\/\S+/g, '[url]').slice(0, 180)));
  page.on('response', (response) => {
    const status = response.status();
    if (status < 400) return;
    const url = new URL(response.url());
    if (url.pathname === '/favicon.ico' || url.pathname.startsWith('/_next/')) return;
    pending.push((async () => {
      let detail = '';
      if (url.pathname.startsWith('/api/')) {
        const text = await response.text().catch(() => '');
        const match = text.match(/"message":"([^"]{0,140})"/);
        detail = match?.[1] ? ` ${match[1]}` : '';
      }
      failedNetwork.push(`${status} ${url.pathname}${detail}`);
    })());
  });
  return { logs, failedNetwork, pending };
}

async function settle(page, pending) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForSelector('main h1', { timeout: 8000 }).catch(() => {});
  const started = Date.now();
  while (Date.now() - started < 8000) {
    const body = await page.locator('main').innerText().catch(() => '');
    if (!/Loading…|Loading balances|Loading codes/.test(body) && body.trim().length > 20) break;
    await page.waitForTimeout(250);
  }
  await Promise.all(pending);
}

async function themeProblem(page) {
  const theme = await page.evaluate(() => {
    const attr = document.documentElement.getAttribute('data-theme');
    const color = getComputedStyle(document.body).backgroundColor;
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    const light = match ? Number(match[1]) > 180 && Number(match[2]) > 160 : false;
    return { attr, light };
  }).catch(() => ({ attr: 'unknown', light: false }));
  if (theme.attr === 'light' || theme.light) return ['renders light theme'];
  return [];
}

async function controlLabel(locator) {
  const text = await locator.innerText({ timeout: 1000 }).catch(() => '');
  return text.replace(/\s+/g, ' ').trim();
}

async function clickControls(page, selector, noun) {
  const problems = [];
  const seen = new Set();
  for (let guard = 0; guard < 40; guard += 1) {
    const controls = page.locator(selector);
    const count = await controls.count().catch(() => 0);
    let advanced = false;
    for (let index = 0; index < count; index += 1) {
      const control = controls.nth(index);
      const label = await controlLabel(control);
      if (!label || seen.has(label) || SKIP_CONTROL.test(label)) continue;
      if (noun === 'button' && (await control.getAttribute('type').catch(() => null)) === 'submit') continue;
      if (!(await control.isVisible().catch(() => false))) continue;
      if (await control.isDisabled().catch(() => true)) continue;
      seen.add(label);
      await control.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
      let clicked = await control.evaluate((node) => {
        if (!(node instanceof HTMLElement)) return false;
        node.click();
        return true;
      }).catch(() => false);
      if (!clicked) clicked = await control.click({ timeout: 800, force: true }).then(() => true).catch(() => false);
      if (!clicked) problems.push(`dead ${noun}: ${label.slice(0, 60)}`);
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(40);
      const body = await page.locator('body').innerText({ timeout: 2000 }).catch(() => '');
      if (/An unexpected error occurred/i.test(body)) problems.push(`${noun} "${label.slice(0, 40)}" opened the error boundary`);
      advanced = true;
      break;
    }
    if (!advanced) break;
  }
  return problems;
}

async function exercise(page) {
  const problems = [
    ...(await clickControls(page, 'main button, main [role="tab"]', 'control')),
  ];
  const links = page.locator('nav[aria-label="Workspace"] a[href]');
  const linkCount = await links.count().catch(() => 0);
  for (let index = 0; index < linkCount; index += 1) {
    const href = await links.nth(index).getAttribute('href', { timeout: 1000 }).catch(() => null);
    if (href === null) continue;
    if (href === '' || href === '#' || href.startsWith('javascript:')) problems.push(`dead link: ${href || '(empty)'}`);
  }
  return problems;
}

async function openRoute(context, role, route, width, serverLog) {
  const page = await context.newPage();
  const attached = attach(page);
  await page.addInitScript(() => {
    localStorage.setItem('btc-theme', 'dark');
    localStorage.setItem('btc-theme-v', '3');
  });
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  const logMark = serverLog.text.length;
  const response = await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
  const status = response ? response.status() : 0;
  if (!response || status >= 400) {
    await page.close();
    return { route, role, width, pass: false, problems: [`HTTP ${status || 'failed'}`] };
  }
  await settle(page, attached.pending);
  if (width === 390) {
    const opener = page.getByLabel('Open navigation');
    if (await opener.count()) {
      await opener.click().catch(() => {});
      await page.waitForTimeout(200);
      const closer = page.getByLabel('Close navigation');
      if (await closer.count()) {
        await closer.click({ position: { x: 370, y: 80 }, force: true }).catch(() => {});
      }
    }
  }
  const body = await page.locator('body').innerText().catch(() => '');
  if (width === 1440) {
    const slug = `${role}-${route.replace(/[/?=&]/g, '-')}`;
    await page.screenshot({ path: path.join(shotDir, `${slug}.png`) }).catch(() => {});
  }
  const problems = [
    ...problemsIn(body, attached.logs, attached.failedNetwork),
    ...(await themeProblem(page)),
    ...(await layoutProblem(page)),
    ...(await exercise(page)),
  ];
  const fresh = serverLog.text.slice(logMark);
  const serverHit = fresh.split('\n').filter((line) => /Error|error|TypeError|Exception/.test(line) && !/AuthRetryableFetchError/.test(line)).slice(0, 2);
  if (serverHit.length > 0 && problems.length > 0) problems.push(`server: ${serverHit.join(' ').replace(/\s+/g, ' ').slice(0, 220)}`);
  const landed = new URL(page.url()).pathname;
  const expected = route.split('?')[0];
  if (expected === '/remy') {
    if (/Back to dashboard/i.test(body)) problems.push('remy Back to dashboard link');
    const hasInnerSide = await page.evaluate(() => Boolean(document.querySelector('main .ai-side'))).catch(() => false);
    if (hasInnerSide) problems.push('remy inner sidebar');
  }
  if (expected === '/intelligence') {
    if (/\bplatform\s+lacks?\b.*\binfrastructure\b|\b(?:lacks?|lacking|insufficient)\s+(?:the\s+|sufficient\s+|necessary\s+)?infrastructure\b/i.test(body)) {
      problems.push('unfiltered infrastructure noise');
    }
  }
  if (expected === '/marketing') {
    if (/Customer id/i.test(body)) problems.push('raw Customer id field on marketing');
  }
  if (expected === '/discounts') {
    if (/Amount in minor units/i.test(body)) problems.push('raw minor units label on discounts');
  }
  if (landed !== expected) problems.push(`landed on ${landed}`);
  await page.close();
  return { route, role, width, pass: problems.length === 0, problems };
}

async function signIn(browser, admin, email, file) {
  const generated = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${base}/auth/callback` },
  });
  const tokenHash = generated.data?.properties?.hashed_token;
  if (!tokenHash || generated.error) throw new Error('Could not create a sign-in link');
  const context = await browser.newContext({ colorScheme: 'dark' });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('btc-theme', 'dark');
    localStorage.setItem('btc-theme-v', '3');
  });
  await page.goto(`${base}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(800);
  const landed = new URL(page.url());
  if (!/\/(overview|today|onboarding)/.test(landed.pathname)) {
    const reason = landed.searchParams.get('reason') || landed.searchParams.get('error') || landed.pathname;
    await context.close();
    throw new Error(`Sign-in did not reach the dashboard (${reason})`);
  }
  await context.storageState({ path: file });
  await context.close();
}

function markdown(rows) {
  const lines = [
    '# Page audit',
    '',
    `Generated by \`npm run check:pages\`. A FAIL blocks the phase.`,
    '',
    '| Route | Role | Viewport | Result | Reason |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const row of rows) {
    const reason = row.pass ? '' : row.problems.join('; ').replace(/\|/g, '/');
    lines.push(`| ${row.route} | ${row.role} | ${row.width} | ${row.pass ? 'PASS' : 'FAIL'} | ${reason} |`);
  }
  const failed = rows.filter((row) => !row.pass).length;
  lines.push('', `${rows.length - failed} passed, ${failed} failed, ${rows.length} total.`);
  return `${lines.join('\n')}\n`;
}

async function main() {
  const env = loadEnv(await readFile(path.join(root, '.env.local'), 'utf8'));
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase admin credentials are missing');
  await mkdir(shotDir, { recursive: true });
  await mkdir(path.dirname(logPath), { recursive: true });

  if (process.env.CHECK_PAGES_SKIP_BUILD !== '1') {
    const build = spawn('./node_modules/.bin/next', ['build'], { cwd: root, stdio: 'inherit' });
    const built = await new Promise((resolve) => build.on('exit', resolve));
    if (built !== 0) throw new Error('next build failed');
  }

  const server = spawn('./node_modules/.bin/next', ['start', '-p', port], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  const serverLog = { text: '' };
  const append = (chunk) => {
    serverLog.text += chunk.toString();
    if (serverLog.text.length > 400000) serverLog.text = serverLog.text.slice(-300000);
  };
  server.stdout.on('data', append);
  server.stderr.on('data', append);
  try {
    let up = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        const ping = await fetch(`${base}/login`);
        if (ping.status < 500) {
          up = true;
          break;
        }
      } catch {
        // still starting
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    if (!up) throw new Error('The check server did not start');

    const admin = createClient(url, key, { auth: { persistSession: false } });
    const owners = await admin.from('profiles').select('id').eq('role', 'owner').limit(1);
    if (!owners.data?.[0]) throw new Error('No owner profile');
    const ownerUser = await admin.auth.admin.getUserById(owners.data[0].id);
    const ownerEmail = ownerUser.data.user?.email;
    if (!ownerEmail) throw new Error('Owner has no email');

    const browser = await chromium.launch();
    const stateDir = path.join(root, '.cursor', 'e2e');
    await signIn(browser, admin, ownerEmail, path.join(stateDir, 'owner.json'));

    const resellers = await admin.from('profiles').select('id').eq('role', 'reseller').eq('status', 'active').limit(1);
    let resellerReady = false;
    if (resellers.data?.[0]) {
      const resellerUser = await admin.auth.admin.getUserById(resellers.data[0].id);
      const resellerEmail = resellerUser.data.user?.email;
      if (resellerEmail) {
        await signIn(browser, admin, resellerEmail, path.join(stateDir, 'reseller.json'));
        resellerReady = true;
      }
    }

    const rows = [];
    for (const role of ['owner', 'reseller']) {
      for (const problem of duplicatePaths(role)) {
        rows.push({ route: '(nav)', role, width: 1440, pass: false, problems: [problem] });
      }
    }
    const ownerContext = await browser.newContext({ storageState: path.join(stateDir, 'owner.json'), colorScheme: 'dark' });
    for (const route of ownerRoutes) {
      for (const width of [1440, 390]) {
        let row = await openRoute(ownerContext, 'owner', route, width, serverLog).catch((error) => ({
          route,
          role: 'owner',
          width,
          pass: false,
          problems: [error instanceof Error ? error.message.slice(0, 180) : 'check failed'],
        }));
        if (!row.pass && row.problems.every((problem) => /stuck loading|ERR_NETWORK|Failed to fetch|net::ERR|check failed/i.test(problem))) {
          row = await openRoute(ownerContext, 'owner', route, width, serverLog).catch(() => row);
        }
        rows.push(row);
        await writeFile(auditPath, markdown(rows));
        console.log(`${row.pass ? 'PASS' : 'FAIL'} owner ${route} ${width}${row.pass ? '' : ` — ${row.problems.join(', ')}`}`);
      }
    }
    await ownerContext.close();

    if (resellerReady) {
      const resellerContext = await browser.newContext({ storageState: path.join(stateDir, 'reseller.json'), colorScheme: 'dark' });
      for (const route of resellerRoutes) {
        for (const width of [1440, 390]) {
          let row = await openRoute(resellerContext, 'reseller', route, width, serverLog).catch((error) => ({
          route,
          role: 'reseller',
          width,
          pass: false,
          problems: [error instanceof Error ? error.message.slice(0, 180) : 'check failed'],
        }));
        if (!row.pass && row.problems.every((problem) => /stuck loading|ERR_NETWORK|Failed to fetch|net::ERR|check failed/i.test(problem))) {
          row = await openRoute(resellerContext, 'reseller', route, width, serverLog).catch(() => row);
        }
        rows.push(row);
        await writeFile(auditPath, markdown(rows));
        console.log(`${row.pass ? 'PASS' : 'FAIL'} reseller ${route} ${width}${row.pass ? '' : ` — ${row.problems.join(', ')}`}`);
        }
      }
      await resellerContext.close();
    } else {
      rows.push({ route: '(reseller)', role: 'reseller', width: 0, pass: false, problems: ['No active reseller to sign in'] });
    }
    await browser.close();
    await writeFile(logPath, serverLog.text);
    await writeFile(auditPath, markdown(rows));
    if (rows.some((row) => !row.pass)) process.exitCode = 1;
  } finally {
    server.kill('SIGTERM');
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Page check failed';
  console.error(message.replace(/token_hash=[^&\s]+/g, 'token_hash=redacted').replace(/eyJ[A-Za-z0-9._-]+/g, '[redacted]'));
  process.exit(1);
});
