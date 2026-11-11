/**
 * @file integrations/bsc/verify.ts
 *
 * Strict BEP20 USDT transfer check on BNB Smart Chain.
 * A transfer is accepted only from a receipt, the official USDT contract,
 * the store address, enough confirmations, and a block after the claim existed.
 * Provider failures return unavailable. They never return success.
 *
 * @module Bsc
 */

/** Official Binance-Peg BSC-USD (USDT) on BNB Smart Chain. 18 decimals. */
export const BSC_USDT_CONTRACT = '0x55d398326f99059fF775485246999027B3197955';

/** keccak256("Transfer(address,address,uint256)"). */
export const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/** 18-decimal raw token units divided by this become 6-decimal minor units. */
export const BSC_USDT_MINOR_DIVISOR = 1_000_000_000_000n;

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const DEFAULT_CONFIRMATIONS = 15;
const DEFAULT_TIMEOUT_MS = 4_000;

const DEFAULT_RPC_URLS = [
  'https://bsc-dataseed.binance.org',
  'https://bsc-dataseed1.defibit.io',
  'https://bsc-dataseed1.ninicoin.io',
  'https://bsc.publicnode.com',
];

export type VerifyRejectReason =
  | 'INVALID_HASH'
  | 'INVALID_ADDRESS'
  | 'INVALID_AMOUNT'
  | 'NOT_FOUND'
  | 'TX_FAILED'
  | 'WRONG_TOKEN'
  | 'WRONG_RECIPIENT'
  | 'NO_TRANSFER'
  | 'AMOUNT_MISMATCH'
  | 'TOO_EARLY'
  | 'TOO_FEW_CONFIRMATIONS';

export type ChainLog = {
  readonly address?: string;
  readonly topics?: readonly string[];
  readonly data?: string;
};

export type ChainReceipt = {
  readonly status?: string | number;
  readonly blockNumber?: string | number;
  readonly logs?: readonly ChainLog[] | null;
};

export interface ChainReader {
  readonly name: string;
  getReceipt(txHash: string): Promise<ChainReceipt | null>;
  getBlockNumber(): Promise<bigint>;
  getBlockTimestamp(blockNumber: bigint): Promise<bigint>;
}

export type VerifyUsdtTransferInput = {
  readonly txHash: string;
  readonly toAddress: string;
  /** Received minor units must equal this. A larger transfer is rejected. */
  readonly exactAmountMinor: bigint;
  readonly notBefore: Date;
  readonly minConfirmations?: number;
};

export type VerifyUsdtTransferResult =
  | {
      readonly status: 'verified';
      readonly amountMinor: bigint;
      readonly confirmations: number;
      readonly blockNumber: bigint;
      readonly blockTimestamp: Date;
      readonly fromAddress: string;
    }
  | {
      readonly status: 'rejected';
      readonly reason: VerifyRejectReason;
      readonly confirmations?: number;
      readonly amountMinor?: bigint;
    }
  | { readonly status: 'unavailable'; readonly reason: 'NO_PROVIDER' | 'PROVIDER_ERROR' };

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Converts an 18-decimal BSC USDT raw amount into 6-decimal minor units.
 * Division truncates toward zero, so dust below 0.000001 USDT is dropped.
 */
export function usdtRawToMinorUnits(raw: bigint): bigint {
  if (raw < 0n) {
    throw new Error('raw token amount must be non-negative');
  }
  return raw / BSC_USDT_MINOR_DIVISOR;
}

export function normalizeEthAddress(value: string): string | null {
  const trimmed = value.trim();
  if (!ADDRESS.test(trimmed)) {
    return null;
  }
  return trimmed.toLowerCase();
}

export type ChainEnv = Readonly<Record<string, string | undefined>>;

export function bep20MinConfirmations(env: ChainEnv = process.env): number {
  const raw = env.BEP20_MIN_CONFIRMATIONS;
  if (raw === undefined || !/^\d+$/.test(raw)) {
    return DEFAULT_CONFIRMATIONS;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10_000) {
    return DEFAULT_CONFIRMATIONS;
  }
  return parsed;
}

function realKey(value: string | undefined): string | null {
  if (!value || value.startsWith('PLACEHOLDER')) {
    return null;
  }
  return value.trim() || null;
}

export function readersFromEnv(env: ChainEnv = process.env, timeoutMs = DEFAULT_TIMEOUT_MS): ChainReader[] {
  const readers: ChainReader[] = [];
  const configured = env.BSC_RPC_URLS;
  const urls =
    configured === undefined
      ? DEFAULT_RPC_URLS
      : configured
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.startsWith('https://') || item.startsWith('http://'));
  for (const url of urls) {
    readers.push(createJsonRpcReader(url, { timeoutMs }));
  }
  const etherscanKey = realKey(env.ETHERSCAN_API_KEY);
  if (etherscanKey) {
    readers.push(createEtherscanReader(etherscanKey, { timeoutMs }));
  }
  return readers;
}

export function createJsonRpcReader(
  endpoint: string,
  options?: { readonly timeoutMs?: number; readonly fetchImpl?: FetchLike },
): ChainReader {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options?.fetchImpl ?? fetch;
  return {
    name: 'bsc-rpc',
    async getReceipt(txHash: string): Promise<ChainReceipt | null> {
      const result = await rpc(fetchImpl, endpoint, timeoutMs, 'eth_getTransactionReceipt', [txHash]);
      return asReceipt(result);
    },
    async getBlockNumber(): Promise<bigint> {
      return hexToBigint(await rpc(fetchImpl, endpoint, timeoutMs, 'eth_blockNumber', []));
    },
    async getBlockTimestamp(blockNumber: bigint): Promise<bigint> {
      const result = await rpc(fetchImpl, endpoint, timeoutMs, 'eth_getBlockByNumber', [toHex(blockNumber), false]);
      return blockTimestamp(result);
    },
  };
}

export function createEtherscanReader(
  apiKey: string,
  options?: { readonly timeoutMs?: number; readonly fetchImpl?: FetchLike },
): ChainReader {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options?.fetchImpl ?? fetch;
  const key = apiKey;
  return {
    name: 'etherscan-v2',
    async getReceipt(txHash: string): Promise<ChainReceipt | null> {
      const result = await etherscan(fetchImpl, key, timeoutMs, 'eth_getTransactionReceipt', { txhash: txHash });
      return asReceipt(result);
    },
    async getBlockNumber(): Promise<bigint> {
      return hexToBigint(await etherscan(fetchImpl, key, timeoutMs, 'eth_blockNumber', {}));
    },
    async getBlockTimestamp(blockNumber: bigint): Promise<bigint> {
      const result = await etherscan(fetchImpl, key, timeoutMs, 'eth_getBlockByNumber', {
        tag: toHex(blockNumber),
        boolean: 'false',
      });
      return blockTimestamp(result);
    },
  };
}

export async function probeChainProviders(readers?: readonly ChainReader[]): Promise<'ok' | 'down'> {
  const list = (readers ?? readersFromEnv()).slice(0, 3);
  if (list.length === 0) {
    return 'down';
  }
  try {
    await Promise.any(
      list.map(async (reader) => {
        const height = await reader.getBlockNumber();
        if (height <= 0n) {
          throw new Error('provider failed');
        }
        return true;
      }),
    );
    return 'ok';
  } catch {
    return 'down';
  }
}

export async function verifyUsdtTransfer(
  input: VerifyUsdtTransferInput,
  options?: { readonly readers?: readonly ChainReader[]; readonly minConfirmations?: number },
): Promise<VerifyUsdtTransferResult> {
  if (!TX_HASH.test(input.txHash.trim())) {
    return { status: 'rejected', reason: 'INVALID_HASH' };
  }
  const recipient = normalizeEthAddress(input.toAddress);
  if (!recipient) {
    return { status: 'rejected', reason: 'INVALID_ADDRESS' };
  }
  if (input.exactAmountMinor <= 0n) {
    return { status: 'rejected', reason: 'INVALID_AMOUNT' };
  }
  if (Number.isNaN(input.notBefore.getTime())) {
    return { status: 'unavailable', reason: 'PROVIDER_ERROR' };
  }

  const readers = options?.readers ?? readersFromEnv();
  if (readers.length === 0) {
    return { status: 'unavailable', reason: 'NO_PROVIDER' };
  }

  const loaded = await firstReceipt(readers, input.txHash.trim());
  if (loaded.kind === 'unavailable') {
    return { status: 'unavailable', reason: 'PROVIDER_ERROR' };
  }
  if (loaded.kind === 'not_found') {
    return { status: 'rejected', reason: 'NOT_FOUND' };
  }

  const receipt = loaded.receipt;
  const status = receiptStatus(receipt.status);
  if (status === 'unknown') {
    return { status: 'unavailable', reason: 'PROVIDER_ERROR' };
  }
  if (status === 'failed') {
    return { status: 'rejected', reason: 'TX_FAILED' };
  }

  const blockNumber = parseBlock(receipt.blockNumber);
  if (blockNumber === null) {
    return { status: 'unavailable', reason: 'PROVIDER_ERROR' };
  }
  if (!Array.isArray(receipt.logs)) {
    return { status: 'unavailable', reason: 'PROVIDER_ERROR' };
  }

  const parsed = parseLogs(receipt.logs, recipient);
  if (parsed.malformed) {
    return { status: 'unavailable', reason: 'PROVIDER_ERROR' };
  }
  if (parsed.matches.length === 0) {
    if (parsed.otherRecipient) {
      return { status: 'rejected', reason: 'WRONG_RECIPIENT' };
    }
    if (parsed.otherToken) {
      return { status: 'rejected', reason: 'WRONG_TOKEN' };
    }
    return { status: 'rejected', reason: 'NO_TRANSFER' };
  }

  const raw = parsed.matches.reduce((sum, item) => sum + item.raw, 0n);
  const amountMinor = usdtRawToMinorUnits(raw);
  if (amountMinor !== input.exactAmountMinor) {
    return { status: 'rejected', reason: 'AMOUNT_MISMATCH', amountMinor };
  }

  const view = await blockView(readers, loaded.reader, blockNumber);
  if (!view) {
    return { status: 'unavailable', reason: 'PROVIDER_ERROR' };
  }
  const blockMs = view.timestamp * 1000n;
  if (blockMs <= BigInt(input.notBefore.getTime())) {
    return { status: 'rejected', reason: 'TOO_EARLY', amountMinor };
  }
  if (view.current < blockNumber) {
    return { status: 'unavailable', reason: 'PROVIDER_ERROR' };
  }
  const confirmations = view.current - blockNumber + 1n;
  const required = options?.minConfirmations ?? input.minConfirmations ?? bep20MinConfirmations();
  if (confirmations < BigInt(required)) {
    return {
      status: 'rejected',
      reason: 'TOO_FEW_CONFIRMATIONS',
      confirmations: Number(confirmations > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : confirmations),
      amountMinor,
    };
  }

  const fromAddress = parsed.matches[0]?.from ?? recipient;
  return {
    status: 'verified',
    amountMinor,
    confirmations: Number(confirmations > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : confirmations),
    blockNumber,
    blockTimestamp: new Date(Number(blockMs)),
    fromAddress,
  };
}

type ParsedTransfer = { readonly from: string; readonly raw: bigint };

function parseLogs(
  logs: readonly ChainLog[],
  recipient: string,
): { readonly matches: ParsedTransfer[]; readonly otherRecipient: boolean; readonly otherToken: boolean; readonly malformed: boolean } {
  const contract = BSC_USDT_CONTRACT.toLowerCase();
  const topic = ERC20_TRANSFER_TOPIC.toLowerCase();
  const matches: ParsedTransfer[] = [];
  let otherRecipient = false;
  let otherToken = false;
  for (const log of logs) {
    const address = typeof log.address === 'string' ? log.address.toLowerCase() : '';
    const topics = log.topics ?? [];
    const topic0 = (topics[0] ?? '').toLowerCase();
    if (topic0 !== topic) {
      continue;
    }
    if (address !== contract) {
      otherToken = true;
      continue;
    }
    const from = topics[1] ? addressFromTopic(topics[1]) : null;
    const to = topics[2] ? addressFromTopic(topics[2]) : null;
    const raw = typeof log.data === 'string' ? parseUint256(log.data) : null;
    if (!from || !to || raw === null) {
      return { matches: [], otherRecipient: false, otherToken: false, malformed: true };
    }
    if (to !== recipient) {
      otherRecipient = true;
      continue;
    }
    matches.push({ from, raw });
  }
  return { matches, otherRecipient, otherToken, malformed: false };
}

function addressFromTopic(topic: string): string | null {
  const hex = topic.toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    return null;
  }
  return `0x${hex.slice(24)}`;
}

function parseUint256(data: string): bigint | null {
  const hex = data.toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{1,64}$/.test(hex)) {
    return null;
  }
  return BigInt(`0x${hex}`);
}

function receiptStatus(status: string | number | undefined): 'ok' | 'failed' | 'unknown' {
  if (status === 1 || status === '0x1' || status === '0x01' || status === '1') {
    return 'ok';
  }
  if (status === 0 || status === '0x0' || status === '0x00' || status === '0') {
    return 'failed';
  }
  return 'unknown';
}

function parseBlock(value: string | number | undefined): bigint | null {
  try {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
      return BigInt(value);
    }
    if (typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value)) {
      return BigInt(value);
    }
    return null;
  } catch {
    return null;
  }
}

async function firstReceipt(
  readers: readonly ChainReader[],
  txHash: string,
): Promise<
  | { readonly kind: 'receipt'; readonly receipt: ChainReceipt; readonly reader: ChainReader }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'unavailable' }
> {
  let sawNull = false;
  for (const reader of readers) {
    try {
      const receipt = await reader.getReceipt(txHash);
      if (receipt) {
        return { kind: 'receipt', receipt, reader };
      }
      sawNull = true;
    } catch {
      continue;
    }
  }
  return sawNull ? { kind: 'not_found' } : { kind: 'unavailable' };
}

async function blockView(
  readers: readonly ChainReader[],
  preferred: ChainReader,
  blockNumber: bigint,
): Promise<{ readonly current: bigint; readonly timestamp: bigint } | null> {
  const ordered = [preferred, ...readers.filter((reader) => reader !== preferred)];
  for (const reader of ordered) {
    try {
      const current = await reader.getBlockNumber();
      const timestamp = await reader.getBlockTimestamp(blockNumber);
      if (current < 0n || timestamp < 0n) {
        continue;
      }
      return { current, timestamp };
    } catch {
      continue;
    }
  }
  return null;
}

async function rpc(
  fetchImpl: FetchLike,
  endpoint: string,
  timeoutMs: number,
  method: string,
  params: readonly unknown[],
): Promise<unknown> {
  const body = await requestJson(fetchImpl, endpoint, timeoutMs, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('provider failed');
  }
  const record = body as { readonly error?: unknown; readonly result?: unknown };
  if (record.error) {
    throw new Error('provider failed');
  }
  return record.result ?? null;
}

async function etherscan(
  fetchImpl: FetchLike,
  apiKey: string,
  timeoutMs: number,
  action: string,
  params: Record<string, string>,
): Promise<unknown> {
  const url = new URL('https://api.etherscan.io/v2/api');
  url.searchParams.set('chainid', '56');
  url.searchParams.set('module', 'proxy');
  url.searchParams.set('action', action);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set('apikey', apiKey);
  const body = await requestJson(fetchImpl, url.toString(), timeoutMs, { method: 'GET' });
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('provider failed');
  }
  const record = body as { readonly result?: unknown; readonly status?: unknown; readonly message?: unknown };
  if (typeof record.result === 'string') {
    throw new Error('provider failed');
  }
  return record.result ?? null;
}

async function requestJson(fetchImpl: FetchLike, url: string, timeoutMs: number, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw new Error('provider failed');
    }
    return await response.json();
  } catch {
    throw new Error('provider failed');
  } finally {
    clearTimeout(timer);
  }
}

function asReceipt(result: unknown): ChainReceipt | null {
  if (result === null || result === undefined) {
    return null;
  }
  if (typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('provider failed');
  }
  return result as ChainReceipt;
}

function blockTimestamp(result: unknown): bigint {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('provider failed');
  }
  const timestamp = (result as { readonly timestamp?: unknown }).timestamp;
  return hexToBigint(timestamp);
}

function hexToBigint(value: unknown): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new Error('provider failed');
  }
  return BigInt(value);
}

function toHex(value: bigint): string {
  return `0x${value.toString(16)}`;
}
