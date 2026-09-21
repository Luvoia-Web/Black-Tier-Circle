/**
 * @file integrations/bsc/client.ts
 *
 * BEP20 USDT transfer verification: sandbox by default.
 *
 * Real RPC / BscScan verification is added in Phase 5. Placeholder
 * API keys activate the sandbox client automatically.
 *
 * @module Bsc
 */

import { logger } from '@/lib/logger';
import type { BscClient, BscTxVerificationParams, BscTxVerificationResult } from './types';

export type { BscClient, BscTxVerificationParams, BscTxVerificationResult } from './types';

function isPlaceholder(value: string | undefined): boolean {
  return !value || value.startsWith('PLACEHOLDER');
}

/**
 * Sandbox BscClient. FAIL_ hashes are rejected; all others verify.
 *
 * @returns Client that never calls RPC
 */
export function createSandboxBscClient(): BscClient {
  return {
    async verifyUsdtTransfer(params: BscTxVerificationParams): Promise<BscTxVerificationResult> {
      if (params.txHash.startsWith('FAIL_')) {
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

/**
 * Real client factory. Uses sandbox when BscScan key is a placeholder.
 *
 * @returns Sandbox client, or throws until Phase 5 implements live verification
 */
export function createBscClient(): BscClient {
  const apiKey = process.env.BSCSCAN_API_KEY;
  if (isPlaceholder(apiKey)) {
    logger.warn('BSC real credentials not set — using sandbox client');
    return createSandboxBscClient();
  }
  throw new Error('Real BSC client not yet implemented — add in Phase 5');
}
