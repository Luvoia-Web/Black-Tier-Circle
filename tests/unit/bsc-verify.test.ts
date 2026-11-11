/**
 * @file tests/unit/bsc-verify.test.ts
 *
 * 18-decimal BSC USDT conversion and fail-closed transfer checks.
 *
 * @module Tests
 */

import { describe, expect, it } from 'vitest';
import {
  BSC_USDT_CONTRACT,
  ERC20_TRANSFER_TOPIC,
  type ChainReader,
  type ChainReceipt,
  createJsonRpcReader,
  probeChainProviders,
  readersFromEnv,
  usdtRawToMinorUnits,
  verifyUsdtTransfer,
} from '@/integrations/bsc/verify';

const RECIPIENT = '0x1111111111111111111111111111111111111111';
const SENDER = '0x2222222222222222222222222222222222222222';
const OTHER = '0x3333333333333333333333333333333333333333';
const HASH = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NOT_BEFORE = new Date(1_699_000_000_000);
const BLOCK_TIME = 1_700_000_000n;
const ONE_USDT_RAW = 10n ** 18n;

function topic(address: string): string {
  return `0x${address.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`;
}

function data(raw: bigint): string {
  return `0x${raw.toString(16).padStart(64, '0')}`;
}

function receipt(overrides?: Partial<ChainReceipt> & { readonly raw?: bigint; readonly to?: string; readonly token?: string }): ChainReceipt {
  const token = overrides?.token ?? BSC_USDT_CONTRACT;
  const to = overrides?.to ?? RECIPIENT;
  const raw = overrides?.raw ?? ONE_USDT_RAW;
  return {
    status: overrides?.status ?? '0x1',
    blockNumber: overrides?.blockNumber ?? '0x10',
    logs:
      overrides?.logs ??
      [
        {
          address: token,
          topics: [ERC20_TRANSFER_TOPIC, topic(SENDER), topic(to)],
          data: data(raw),
        },
      ],
  };
}

function reader(options?: {
  readonly receipt?: ChainReceipt | null;
  readonly height?: bigint;
  readonly timestamp?: bigint;
  readonly fail?: 'receipt' | 'block' | 'all';
}): ChainReader {
  return {
    name: 'test',
    async getReceipt(): Promise<ChainReceipt | null> {
      if (options?.fail === 'receipt' || options?.fail === 'all') {
        throw new Error('down');
      }
      return options?.receipt === undefined ? receipt() : options.receipt;
    },
    async getBlockNumber(): Promise<bigint> {
      if (options?.fail === 'block' || options?.fail === 'all') {
        throw new Error('down');
      }
      return options?.height ?? 30n;
    },
    async getBlockTimestamp(): Promise<bigint> {
      if (options?.fail === 'block' || options?.fail === 'all') {
        throw new Error('down');
      }
      return options?.timestamp ?? BLOCK_TIME;
    },
  };
}

function check(partial?: Partial<Parameters<typeof verifyUsdtTransfer>[0]>, chain: ChainReader = reader()) {
  return verifyUsdtTransfer(
    {
      txHash: HASH,
      toAddress: RECIPIENT,
      minAmountMinor: 1_000_000n,
      notBefore: NOT_BEFORE,
      ...partial,
    },
    { readers: [chain], minConfirmations: 15 },
  );
}

describe('usdtRawToMinorUnits', () => {
  it('converts 1 BSC USDT (18 decimals) to 1000000 minor units', () => {
    expect(usdtRawToMinorUnits(10n ** 18n)).toBe(1_000_000n);
  });

  it('drops dust below 0.000001 USDT', () => {
    expect(usdtRawToMinorUnits(10n ** 12n - 1n)).toBe(0n);
    expect(usdtRawToMinorUnits(10n ** 18n + 10n ** 12n - 1n)).toBe(1_000_000n);
  });

  it('keeps one minor unit when the raw amount is exactly 10^12', () => {
    expect(usdtRawToMinorUnits(10n ** 12n)).toBe(1n);
  });

  it('handles large values without floating point', () => {
    expect(usdtRawToMinorUnits(10n ** 30n)).toBe(10n ** 18n);
  });

  it('rejects a negative raw amount', () => {
    expect(() => usdtRawToMinorUnits(-1n)).toThrow(/non-negative/);
  });
});

describe('verifyUsdtTransfer', () => {
  it('accepts a confirmed USDT transfer to the store after notBefore', async () => {
    const result = await check();
    expect(result.status).toBe('verified');
    if (result.status === 'verified') {
      expect(result.amountMinor).toBe(1_000_000n);
      expect(result.confirmations).toBe(15);
      expect(result.fromAddress).toBe(SENDER.toLowerCase());
    }
  });

  it('matches the store address without caring about letter case', async () => {
    const mixed = '0x1111111111111111111111111111111111111111'.replace('1111', 'AbCd');
    const result = await check({ toAddress: mixed }, reader({ receipt: receipt({ to: mixed }) }));
    expect(result.status).toBe('verified');
  });

  it('rejects a hash that is not 0x plus 64 hex characters', async () => {
    const result = await check({ txHash: '0xabc' });
    expect(result).toEqual({ status: 'rejected', reason: 'INVALID_HASH' });
  });

  it('rejects a missing receipt', async () => {
    const result = await check(undefined, reader({ receipt: null }));
    expect(result).toEqual({ status: 'rejected', reason: 'NOT_FOUND' });
  });

  it('rejects a failed transaction', async () => {
    const result = await check(undefined, reader({ receipt: receipt({ status: '0x0' }) }));
    expect(result).toEqual({ status: 'rejected', reason: 'TX_FAILED' });
  });

  it('rejects a different token that emits Transfer', async () => {
    const result = await check(undefined, reader({ receipt: receipt({ token: OTHER }) }));
    expect(result).toEqual({ status: 'rejected', reason: 'WRONG_TOKEN' });
  });

  it('rejects a USDT transfer to a different address', async () => {
    const result = await check(undefined, reader({ receipt: receipt({ to: OTHER }) }));
    expect(result).toEqual({ status: 'rejected', reason: 'WRONG_RECIPIENT' });
  });

  it('rejects an amount that rounds down below the expected minor units', async () => {
    const result = await check(undefined, reader({ receipt: receipt({ raw: 10n ** 18n - 1n }) }));
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') {
      expect(result.reason).toBe('AMOUNT_TOO_SMALL');
      expect(result.amountMinor).toBe(999_999n);
    }
  });

  it('rejects a block timestamp that is not after notBefore', async () => {
    const sameSecond = await check(
      { notBefore: new Date(Number(BLOCK_TIME) * 1000) },
      reader(),
    );
    expect(sameSecond).toMatchObject({ status: 'rejected', reason: 'TOO_EARLY' });
    const before = await check({ notBefore: new Date(Number(BLOCK_TIME) * 1000 + 1_000) }, reader());
    expect(before).toMatchObject({ status: 'rejected', reason: 'TOO_EARLY' });
  });

  it('rejects too few confirmations and reports how many exist', async () => {
    const result = await check(undefined, reader({ height: 29n }));
    expect(result).toMatchObject({ status: 'rejected', reason: 'TOO_FEW_CONFIRMATIONS', confirmations: 14 });
  });

  it('returns unavailable when every provider fails', async () => {
    const result = await check(undefined, reader({ fail: 'all' }));
    expect(result).toEqual({ status: 'unavailable', reason: 'PROVIDER_ERROR' });
  });

  it('returns unavailable when no provider is configured', async () => {
    const result = await verifyUsdtTransfer(
      { txHash: HASH, toAddress: RECIPIENT, minAmountMinor: 1_000_000n, notBefore: NOT_BEFORE },
      { readers: [] },
    );
    expect(result).toEqual({ status: 'unavailable', reason: 'NO_PROVIDER' });
  });

  it('returns unavailable when the receipt shape is unexpected', async () => {
    const result = await check(undefined, reader({ receipt: { status: '0x1', blockNumber: '0x10', logs: null } }));
    expect(result).toEqual({ status: 'unavailable', reason: 'PROVIDER_ERROR' });
  });

  it('uses the next provider when the first one is down', async () => {
    const result = await verifyUsdtTransfer(
      { txHash: HASH, toAddress: RECIPIENT, minAmountMinor: 1_000_000n, notBefore: NOT_BEFORE },
      { readers: [reader({ fail: 'all' }), reader()], minConfirmations: 15 },
    );
    expect(result.status).toBe('verified');
  });

  it('treats a throwing JSON-RPC endpoint as unavailable', async () => {
    const chain = createJsonRpcReader('https://rpc.example', {
      timeoutMs: 20,
      fetchImpl: async () => {
        throw new Error('https://rpc.example/secret should not leak');
      },
    });
    const result = await verifyUsdtTransfer(
      { txHash: HASH, toAddress: RECIPIENT, minAmountMinor: 1_000_000n, notBefore: NOT_BEFORE },
      { readers: [chain] },
    );
    expect(result).toEqual({ status: 'unavailable', reason: 'PROVIDER_ERROR' });
  });
});

describe('provider list', () => {
  it('uses public defaults only when BSC_RPC_URLS is unset', () => {
    expect(readersFromEnv({}).length).toBe(4);
    expect(readersFromEnv({ BSC_RPC_URLS: '' }).length).toBe(0);
    expect(readersFromEnv({ BSC_RPC_URLS: 'https://a.example, https://b.example' }).length).toBe(2);
    expect(readersFromEnv({ BSC_RPC_URLS: '', ETHERSCAN_API_KEY: 'key' }).map((item) => item.name)).toEqual([
      'etherscan-v2',
    ]);
    expect(readersFromEnv({ BSC_RPC_URLS: '', ETHERSCAN_API_KEY: 'PLACEHOLDER_KEY' }).length).toBe(0);
  });

  it('reports down when the probe cannot reach a node', async () => {
    expect(await probeChainProviders([reader({ fail: 'all' })])).toBe('down');
    expect(await probeChainProviders([])).toBe('down');
    expect(await probeChainProviders([reader()])).toBe('ok');
  });
});
