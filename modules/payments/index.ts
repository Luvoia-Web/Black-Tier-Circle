/**
 * @file modules/payments/index.ts
 *
 * Payments public API using sandbox Binance and BSC adapters.
 *
 * @module Payments
 */

import { PaymentError } from '@/lib/errors';
import { createBscClient } from '@/integrations/bsc/client';
import { createBinancePayClient } from '@/integrations/binance/client';
import { randomUUID } from 'node:crypto';
import type { PaymentClaim, PaymentMethod } from './types';

export type { PaymentClaim, PaymentMethod } from './types';

type SubmitClaimParams = {
  readonly orderId: string;
  readonly paymentMethod: PaymentMethod;
  readonly binanceOrderId?: string;
  readonly txHash?: string;
  readonly expectedAmountMinor: bigint;
  readonly expectedToAddress: string;
  readonly orderCreatedAt: Date;
};

/**
 * Records a customer payment claim and verifies it through sandbox adapters.
 *
 * @param params - Claim fields plus expected on-chain or Pay amounts
 * @returns Stored claim
 * @throws PaymentError when sandbox verification fails
 */
export async function submitPaymentClaim(params: SubmitClaimParams): Promise<PaymentClaim> {
  if (params.paymentMethod === 'binance_pay') {
    const merchantTradeNo = params.binanceOrderId;
    if (!merchantTradeNo) {
      throw new PaymentError('MISSING_BINANCE_ORDER', 'Binance Pay claims require an order id');
    }
    const result = await createBinancePayClient().queryOrder(merchantTradeNo);
    if (result.status !== 'PAID') {
      throw new PaymentError('BINANCE_NOT_PAID', 'Binance Pay order is not paid');
    }
  } else {
    const txHash = params.txHash;
    if (!txHash) {
      throw new PaymentError('MISSING_TX_HASH', 'BEP20 claims require a transaction hash');
    }
    const result = await createBscClient().verifyUsdtTransfer({
      txHash,
      expectedToAddress: params.expectedToAddress,
      expectedAmountMinor: params.expectedAmountMinor,
      windowSeconds: 3600,
      orderCreatedAt: params.orderCreatedAt,
    });
    if (!result.verified) {
      throw new PaymentError('BSC_NOT_VERIFIED', result.rejectReason ?? 'Transfer not verified');
    }
  }

  return {
    id: randomUUID(),
    orderId: params.orderId,
    paymentMethod: params.paymentMethod,
    binanceOrderId: params.binanceOrderId === undefined ? null : params.binanceOrderId,
    txHash: params.txHash === undefined ? null : params.txHash,
    submittedAt: new Date().toISOString(),
  };
}
