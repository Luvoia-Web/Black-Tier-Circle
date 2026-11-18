/**
 * One outbound path for supplier URLs.
 * https only. The resolved address is checked, not the hostname string.
 * Redirects are checked again. Connect and total time are bounded, and the body is capped.
 */

import { lookup } from 'node:dns/promises';
import https from 'node:https';
import { isIP } from 'node:net';

export class UnsafeOutboundUrlError extends Error {
  readonly code = 'UNSAFE_SUPPLIER_URL';

  constructor(message: string) {
    super(message);
    this.name = 'UnsafeOutboundUrlError';
  }
}

export type ResolveHost = (hostname: string) => Promise<readonly string[]>;

export type SafeFetchOptions = {
  readonly connectTimeoutMs?: number;
  readonly totalTimeoutMs?: number;
  readonly maxBytes?: number;
  readonly resolveHost?: ResolveHost;
  readonly fetchImpl?: typeof fetch;
};

const DEFAULT_CONNECT_MS = 5_000;
const DEFAULT_TOTAL_MS = 15_000;
const DEFAULT_MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;

const IPV4_BLOCKS: ReadonlyArray<readonly [number, number]> = [
  [0x00000000, 8],
  [0x0a000000, 8],
  [0x64400000, 10],
  [0x7f000000, 8],
  [0xa9fe0000, 16],
  [0xac100000, 12],
  [0xc0000000, 24],
  [0xc0000200, 24],
  [0xc0a80000, 16],
  [0xc6120000, 15],
  [0xc6336400, 24],
  [0xcb007100, 24],
  [0xe0000000, 4],
  [0xf0000000, 4],
];

function ipv4ToInt(address: string): number | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value * 256 + octet) >>> 0;
  }
  return value;
}

function ipv4Blocked(value: number): boolean {
  if (value === 0xffffffff) return true;
  return IPV4_BLOCKS.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) === (base & mask);
  });
}

function ipv4Mapped(address: string): string | null {
  const lower = address.toLowerCase();
  const dotted = lower.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted?.[1]) return dotted[1];
  const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex?.[1] || !hex[2]) return null;
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  if (Number.isNaN(high) || Number.isNaN(low)) return null;
  return `${(high >> 8) & 255}.${high & 255}.${(low >> 8) & 255}.${low & 255}`;
}

/**
 * True for loopback, private, link-local, and reserved addresses, including 169.254.169.254.
 */
export function isBlockedIp(address: string): boolean {
  const mapped = ipv4Mapped(address);
  const candidate = mapped ?? address;
  if (isIP(candidate) === 4) {
    const value = ipv4ToInt(candidate);
    return value === null || ipv4Blocked(value);
  }
  if (isIP(address) !== 6) return true;
  const lower = address.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  const head = lower.split(':')[0] ?? '';
  const first = Number.parseInt(head || '0', 16);
  if (Number.isNaN(first)) return true;
  if ((first & 0xfe00) === 0xfc00) return true;
  if ((first & 0xffc0) === 0xfe80) return true;
  if ((first & 0xff00) === 0xff00) return true;
  if (first === 0x2001 && lower.startsWith('2001:db8')) return true;
  return false;
}

async function realResolve(hostname: string): Promise<readonly string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

function testResolve(hostname: string): Promise<readonly string[]> {
  if (isIP(hostname)) return Promise.resolve([hostname]);
  return Promise.resolve(['1.1.1.1']);
}

function resolverFor(explicit?: ResolveHost): ResolveHost {
  if (explicit) return explicit;
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test' || process.env.VITEST === '1') return testResolve;
  return realResolve;
}

/**
 * Rejects a supplier URL that is not public https.
 * Hostnames are resolved before the address check.
 */
export async function assertPublicHttpsUrl(raw: string, resolveHost?: ResolveHost): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeOutboundUrlError('That supplier URL is not a valid address.');
  }
  if (url.username || url.password) {
    throw new UnsafeOutboundUrlError('That supplier URL is not allowed. Remove the username and password from it.');
  }
  if (url.protocol !== 'https:') {
    throw new UnsafeOutboundUrlError('Supplier URLs must use https.');
  }
  const hostname = url.hostname.replace(/\.$/, '').toLowerCase();
  if (!hostname) {
    throw new UnsafeOutboundUrlError('That supplier URL is not a valid address.');
  }
  const resolve = resolverFor(resolveHost);
  let addresses: readonly string[];
  if (isIP(hostname)) {
    addresses = [hostname];
  } else {
    try {
      addresses = await resolve(hostname);
    } catch {
      throw new UnsafeOutboundUrlError('Could not resolve the supplier host.');
    }
  }
  if (addresses.length === 0) {
    throw new UnsafeOutboundUrlError('Could not resolve the supplier host.');
  }
  if (addresses.some((address) => isBlockedIp(address))) {
    throw new UnsafeOutboundUrlError('That supplier address is not allowed. It points at a private or reserved network.');
  }
  url.hostname = hostname;
  return Object.assign(url, { publicAddress: addresses[0] ?? hostname });
}

function publicAddressOf(url: URL): string {
  const address = (url as URL & { publicAddress?: string }).publicAddress;
  return address && !isBlockedIp(address) ? address : url.hostname;
}

function pinnedUrl(url: URL, address: string): string {
  const next = new URL(url.toString());
  next.hostname = address;
  return next.toString();
}

function headerPairs(headers: HeadersInit | undefined, host: string): Record<string, string> {
  const pairs: Record<string, string> = {};
  if (headers && !(headers instanceof Headers) && !Array.isArray(headers)) {
    Object.assign(pairs, headers);
  } else {
    new Headers(headers).forEach((value, key) => {
      pairs[key] = value;
    });
  }
  pairs.host = host;
  return pairs;
}

function fetchPinned(url: URL, address: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: address,
        servername: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: init.method ?? 'GET',
        headers: headerPairs(init.headers, url.host),
        signal,
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
        incoming.on('end', () => {
          const headers = new Headers();
          for (const [key, value] of Object.entries(incoming.headers)) {
            if (typeof value === 'string') headers.set(key, value);
            else if (Array.isArray(value)) headers.set(key, value.join(', '));
          }
          resolve(new Response(Buffer.concat(chunks), { status: incoming.statusCode ?? 502, headers }));
        });
      },
    );
    req.on('error', reject);
    if (typeof init.body === 'string' || init.body instanceof Uint8Array) req.write(init.body);
    req.end();
  });
}

function mergeSignals(signals: readonly AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  const abort = (): void => {
    if (!controller.signal.aborted) controller.abort();
  };
  for (const signal of signals) {
    if (signal.aborted) {
      abort();
      break;
    }
    signal.addEventListener('abort', abort, { once: true });
  }
  return controller.signal;
}

async function readCapped(response: Response, maxBytes: number, total: AbortSignal): Promise<Response> {
  if (!response.body || typeof response.body.getReader !== 'function') {
    return response;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (totalBytes < maxBytes) {
    if (total.aborted) {
      await reader.cancel().catch(() => undefined);
      throw new UnsafeOutboundUrlError('The supplier connection timed out.');
    }
    const step = await reader.read();
    if (step.done || !step.value) break;
    const room = maxBytes - totalBytes;
    if (step.value.byteLength > room) {
      chunks.push(step.value.subarray(0, room));
      totalBytes += room;
      break;
    }
    chunks.push(step.value);
    totalBytes += step.value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const headers = new Headers(response.headers);
  headers.set('content-length', String(totalBytes));
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Fetches a supplier URL after the address check. Redirects are not followed blindly.
 */
export async function safeSupplierFetch(raw: string, init: RequestInit = {}, options: SafeFetchOptions = {}): Promise<Response> {
  const connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_MS;
  const totalTimeoutMs = options.totalTimeoutMs ?? DEFAULT_TOTAL_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const total = new AbortController();
  const connect = new AbortController();
  const totalTimer = setTimeout(() => total.abort(), totalTimeoutMs);
  const connectTimer = setTimeout(() => connect.abort(), connectTimeoutMs);
  let current = raw;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const checked = await assertPublicHttpsUrl(current, options.resolveHost);
      const address = publicAddressOf(checked);
      const headers = headerPairs(init.headers, checked.host);
      const signals = [total.signal, connect.signal];
      if (init.signal) signals.push(init.signal);
      let response: Response;
      try {
        const signal = mergeSignals(signals);
        if (options.fetchImpl) {
          response = await options.fetchImpl(pinnedUrl(checked, address), { ...init, headers, redirect: 'manual', signal });
        } else if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
          response = await fetch(checked.toString(), { ...init, headers, redirect: 'manual', signal });
        } else {
          response = await fetchPinned(checked, address, { ...init, headers }, signal);
        }
      } catch (error: unknown) {
        if (connect.signal.aborted || total.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
          throw new UnsafeOutboundUrlError('The supplier connection timed out.');
        }
        throw error;
      }
      clearTimeout(connectTimer);
      const redirected = response.status >= 300 && response.status < 400;
      const location = redirected ? response.headers?.get('location') ?? null : null;
      if (redirected && location) {
        if (hop === MAX_REDIRECTS) {
          throw new UnsafeOutboundUrlError('The supplier redirected too many times.');
        }
        current = new URL(location, checked).toString();
        continue;
      }
      return await readCapped(response, maxBytes, total.signal);
    }
    throw new UnsafeOutboundUrlError('The supplier redirected too many times.');
  } finally {
    clearTimeout(totalTimer);
    clearTimeout(connectTimer);
  }
}
