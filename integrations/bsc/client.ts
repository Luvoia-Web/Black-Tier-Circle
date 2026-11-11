/**
 * @file integrations/bsc/client.ts
 *
 * Sandbox-only BEP20 adapter. Live checks go through integrations/bsc/verify.ts.
 * This file does not call BscScan. The sandbox runs only when the caller asks
 * for it, and verifyBep20Claim asks only outside production.
 */

import { logger } from '@/lib/logger';
import { paymentSandboxEnabled, PAYMENT_CONFIG } from '@/lib/payment-config';
import type { BscClient, BscTxVerificationParams, BscTxVerificationResult } from './types';

export type { BscClient, BscTxVerificationParams, BscTxVerificationResult } from './types';

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

function createUnavailableBscClient(): BscClient {
  return {
    async verifyUsdtTransfer(): Promise<BscTxVerificationResult> {
      return { verified: false, rejectReason: 'BSC_UNAVAILABLE' };
    },
  };
}

/**
 * Sandbox only when explicitly enabled outside production. Otherwise the caller
 * must use verifyUsdtTransfer, which fails closed.
 */
export function createBscClient(): BscClient {
  if (paymentSandboxEnabled()) {
    logger.warn('BSC DEMO MODE — no real TX verification');
    return createSandboxBscClient();
  }
  return createUnavailableBscClient();
}
