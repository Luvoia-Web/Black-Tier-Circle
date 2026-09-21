/**
 * @file integrations/bsc/types.ts
 *
 * BEP20 USDT transfer verification types.
 *
 * @module Bsc
 */

export type BscTxVerificationParams = {
  readonly txHash: string;
  readonly expectedToAddress: string;
  readonly expectedAmountMinor: bigint;
  readonly windowSeconds: number;
  readonly orderCreatedAt: Date;
};

export type BscTxVerificationResult = {
  readonly verified: boolean;
  readonly toAddress?: string;
  readonly fromAddress?: string;
  readonly amountMinor?: bigint;
  readonly blockTimestamp?: Date;
  readonly rejectReason?: string;
};

export interface BscClient {
  verifyUsdtTransfer(params: BscTxVerificationParams): Promise<BscTxVerificationResult>;
}
