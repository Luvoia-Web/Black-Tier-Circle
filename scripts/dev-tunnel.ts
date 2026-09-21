/**
 * @file scripts/dev-tunnel.ts
 *
 * Starts an ngrok tunnel and updates NEXT_PUBLIC_APP_URL in .env.local
 * so Telegram webhook registration can reach the local Next.js server.
 *
 * Usage: npm run tunnel
 * Then in a separate terminal: npm run dev
 *
 * When this script stops (Ctrl+C), .env.local is restored
 * to http://localhost:3000 automatically.
 *
 * @module Scripts
 */

import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ENV_FILE = join(process.cwd(), '.env.local');
const LOCAL_URL = 'http://localhost:3000';
const NGROK_API_URL = 'http://localhost:4040/api/tunnels';
const NGROK_READY_ATTEMPTS = 20;
const NGROK_RETRY_MS = 500;

type NgrokTunnel = {
  readonly public_url: string;
};

type NgrokTunnelsResponse = {
  readonly tunnels: readonly NgrokTunnel[];
};

/**
 * Prints how to authenticate ngrok after a first-time install.
 */
function printNgrokAuthHelp(): void {
  console.error('❌ ngrok is not authenticated.');
  console.error('ngrok requires a free account to create a public HTTPS URL.');
  console.error('1. Sign up: https://dashboard.ngrok.com/signup');
  console.error('2. Copy your token: https://dashboard.ngrok.com/get-started/your-authtoken');
  console.error('3. Run: ngrok config add-authtoken <token>');
  console.error('4. Then run: npm run tunnel');
}

/**
 * Exits if ngrok has no local config / authtoken.
 * ngrok v3 will not open a tunnel until this is done once per machine.
 */
function assertNgrokAuthenticated(): void {
  try {
    execSync('ngrok config check', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    printNgrokAuthHelp();
    process.exit(1);
  }
}

/**
 * Reads the current .env.local file, or an empty string if it does not exist.
 *
 * @returns File contents
 */
function readEnv(): string {
  try {
    return readFileSync(ENV_FILE, 'utf-8');
  } catch (error: unknown) {
    // Missing .env.local is valid for a fresh clone — caller writes the file.
    void error;
    return '';
  }
}

/**
 * Replaces or appends NEXT_PUBLIC_APP_URL in an env file body.
 *
 * @param content - Current .env.local contents
 * @param newUrl - Origin to write (ngrok HTTPS URL or localhost)
 * @returns Updated env file body
 */
function updateAppUrl(content: string, newUrl: string): string {
  const line = `NEXT_PUBLIC_APP_URL=${newUrl}`;
  if (content.includes('NEXT_PUBLIC_APP_URL=')) {
    return content.replace(/NEXT_PUBLIC_APP_URL=.*/m, line);
  }
  return content + `\n${line}\n`;
}

/**
 * Polls ngrok's local API until an HTTPS tunnel URL is available.
 *
 * @returns Public HTTPS origin, e.g. https://abcd.ngrok-free.app
 * @throws Error when ngrok does not expose a tunnel within ~10 seconds
 */
async function getNgrokUrl(): Promise<string> {
  for (let attempt = 0; attempt < NGROK_READY_ATTEMPTS; attempt += 1) {
    const publicUrl = await tryReadNgrokHttpsUrl();
    if (publicUrl !== null) {
      return publicUrl;
    }
    await sleep(NGROK_RETRY_MS);
  }
  throw new Error('Could not get ngrok URL after 10 seconds');
}

/**
 * Attempts a single read of ngrok's tunnel list.
 *
 * @returns HTTPS public URL, or null if ngrok is not ready yet
 */
async function tryReadNgrokHttpsUrl(): Promise<string | null> {
  try {
    const response = await fetch(NGROK_API_URL);
    const payload = (await response.json()) as NgrokTunnelsResponse;
    const httpsTunnel = payload.tunnels.find((tunnel) => tunnel.public_url.startsWith('https://'));
    return httpsTunnel?.public_url ?? null;
  } catch (error: unknown) {
    // ngrok's inspector API is not listening yet — caller retries.
    void error;
    return null;
  }
}

/**
 * Waits the given number of milliseconds.
 *
 * @param milliseconds - Delay
 */
function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/**
 * Writes NEXT_PUBLIC_APP_URL and prints operator instructions.
 *
 * @param publicUrl - Active ngrok HTTPS origin
 */
function applyTunnelUrl(publicUrl: string): void {
  const originalEnv = readEnv();
  const updatedEnv = updateAppUrl(originalEnv, publicUrl);
  writeFileSync(ENV_FILE, updatedEnv);

  console.log(`✅ Tunnel active: ${publicUrl}`);
  console.log(`\n📝 Updating .env.local with tunnel URL...`);
  console.log(`✅ NEXT_PUBLIC_APP_URL=${publicUrl}`);
  console.log(`\n⚡ Now run in a NEW terminal: npm run dev`);
  console.log(`🤖 Then go to: http://localhost:3000/reseller/bot`);
  console.log(`   Paste your BotFather token and click Connect`);
  console.log(`\n⏹  Press Ctrl+C to stop tunnel and restore localhost URL\n`);
}

/**
 * Restores localhost in .env.local and stops the ngrok child process.
 *
 * @param ngrokProcess - Spawned ngrok process
 */
function restoreLocalhost(ngrokProcess: ChildProcess): void {
  console.log('\n\n🔄 Restoring .env.local to localhost...');
  const currentEnv = readEnv();
  const restoredEnv = updateAppUrl(currentEnv, LOCAL_URL);
  writeFileSync(ENV_FILE, restoredEnv);
  console.log('✅ Restored. Goodbye!\n');
  ngrokProcess.kill();
  process.exit(0);
}

/**
 * Starts ngrok on port 3000, writes the public URL to .env.local, and
 * restores localhost when the process is stopped.
 */
async function main(): Promise<void> {
  console.log('\n🚇 Starting ngrok tunnel on port 3000...\n');
  assertNgrokAuthenticated();

  const ngrokProcess = spawn('ngrok', ['http', '3000'], {
    stdio: 'ignore',
    detached: false,
  });

  ngrokProcess.on('error', (error: Error) => {
    console.error('❌ ngrok failed to start:', error.message);
    console.error('Make sure ngrok is installed: brew install ngrok/ngrok/ngrok');
    process.exit(1);
  });

  let publicUrl: string;
  try {
    publicUrl = await getNgrokUrl();
  } catch (error: unknown) {
    console.error('❌ Could not get ngrok URL:', error);
    printNgrokAuthHelp();
    ngrokProcess.kill();
    process.exit(1);
  }

  applyTunnelUrl(publicUrl);

  const cleanup = (): void => {
    restoreLocalhost(ngrokProcess);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  await new Promise(() => {
    // Keep the tunnel process alive until Ctrl+C.
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
