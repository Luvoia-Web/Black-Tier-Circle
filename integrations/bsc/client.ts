/**
 * @file integrations/bsc/client.ts
 *
 * BSC (BNB Smart Chain) USDT BEP20 transaction verifier.
 *
 * DEMO MODE (default): sandbox adapter.
 * LIVE MODE: activated when BSCSCAN_API_KEY is set and the caller passes live: true.
 * The expected recipient address comes from the order's resolved wallet.
 *
 * CRITICAL DECIMAL NOTE:
 * USDT on BSC has 18 decimal places.
 * Our system uses 6 decimal places (minor units).
 * Conversion: rawBscValue / 10^12 = our minor units.
 * Use bscValueToMinorUnits() from lib/payment-config.ts for this.
 *
 * Wallet addresses are configured in the owner or reseller dashboard.
 */

import { amountsMatch } from '@/lib/money';
import { logger } from '@/lib/logger';
import { bscValueToMinorUnits, PAYMENT_CONFIG } from '@/lib/payment-config';
import type { BscClient, BscTxVerificationParams, BscTxVerificationResult } from './types';

export type { BscClient, BscTxVerificationParams, BscTxVerificationResult } from './types';

type BscScanTx = {
  readonly hash?: string;
  readonly to?: string;
  readonly from?: string;
  readonly contractAddress?: string;
  readonly value?: string;
  readonly timeStamp?: string;
};

type BscScanResponse = {
  readonly status?: string;
  readonly result?: BscScanTx[] | string;
};

/**
 * Sandbox BscClient. FAIL_ / 0xFAIL hashes are rejected; all others verify.
 *
 * @returns Client that never calls RPC
 */
export function createSandboxBscClient(): BscClient {
  return {
    async verifyUsdtTransfer(params: BscTxVerificationParams): Promise<BscTxVerificationResult> {
      if (
        params.txHash.startsWith(PAYMENT_CONFIG.demo.failTxPrefix) ||
        params.txHash.startsWith('FAIL_')
      ) {
        return { verified: false, rejectReason: 'SANDBOX_FORCED_FAILURE' };
      }
      return {
        verified: true,
        toAddress: params.expectedToAddress,
        fromAddress: '0xSANDBOX_SENDER',
        amountMinor: params.expectedAmountMinor,
        blockTimestamp: new Date(),
      };
    },
  };
}

function createRealBscClient(apiKey: string): BscClient {
  const { bscscanBaseUrl, usdtContractAddress, txWindowSeconds } = PAYMENT_CONFIG.bep20;

  return {
    async verifyUsdtTransfer(params) {
      const expectedWallet = params.expectedToAddress.toLowerCase();
      const url = new URL(bscscanBaseUrl);
      url.searchParams.set('module', 'account');
      url.searchParams.set('action', 'tokentx');
      url.searchParams.set('contractaddress', usdtContractAddress);
      url.searchParams.set('address', expectedWallet);
      url.searchParams.set('apikey', apiKey);
      url.searchParams.set('sort', 'desc');
      url.searchParams.set('page', '1');
      url.searchParams.set('offset', '50');

      const res = await fetch(url.toString());
      const data = (await res.json()) as BscScanResponse;

      if (data.status !== '1' || !Array.isArray(data.result)) {
        return { verified: false, rejectReason: 'BSC_API_ERROR' };
      }

      const tx = data.result.find(
        (item) => (item.hash ?? '').toLowerCase() === params.txHash.toLowerCase(),
      );

      if (!tx) {
        return { verified: false, rejectReason: 'TX_NOT_FOUND' };
      }

      if ((tx.to ?? '').toLowerCase() !== expectedWallet) {
        return { verified: false, rejectReason: 'WRONG_RECIPIENT' };
      }

      if ((tx.contractAddress ?? '').toLowerCase() !== usdtContractAddress.toLowerCase()) {
        return { verified: false, rejectReason: 'WRONG_TOKEN' };
      }

      const receivedMinor = bscValueToMinorUnits(tx.value ?? '0');

      if (!amountsMatch(params.expectedAmountMinor, receivedMinor)) {
        const mismatch: BscTxVerificationResult = {
          verified: false,
          rejectReason: 'AMOUNT_MISMATCH',
          amountMinor: receivedMinor,
        };
        return tx.from ? { ...mismatch, fromAddress: tx.from } : mismatch;
      }

      const txTimestamp = new Date(parseInt(tx.timeStamp ?? '0', 10) * 1000);
      const windowEnd = new Date(params.orderCreatedAt.getTime() + txWindowSeconds * 1000);
      if (txTimestamp > windowEnd) {
        return { verified: false, rejectReason: 'TX_OUTSIDE_WINDOW' };
      }

      const success: BscTxVerificationResult = {
        verified: true,
        amountMinor: receivedMinor,
        blockTimestamp: txTimestamp,
      };
      return {
        ...success,
        ...(tx.to ? { toAddress: tx.to } : {}),
        ...(tx.from ? { fromAddress: tx.from } : {}),
      };
    },
  };
}

/**
 * Factory — real chain lookups only when the caller has a configured wallet and BscScan key.
 */
export function createBscClient(options?: { readonly live?: boolean }): BscClient {
  if (options?.live && PAYMENT_CONFIG.bep20.bscscanApiKey && !PAYMENT_CONFIG.bep20.bscscanApiKey.startsWith('PLACEHOLDER')) {
    return createRealBscClient(PAYMENT_CONFIG.bep20.bscscanApiKey);
  }
  logger.warn('BSC DEMO MODE — no real TX verification');
  return createSandboxBscClient();
}
