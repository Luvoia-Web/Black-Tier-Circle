/**
 * @file integrations/binance/client.ts
 *
 * Binance Pay client: sandbox by default, real client in Phase 5.
 *
 * If credentials start with PLACEHOLDER_, the sandbox adapter activates
 * automatically so local development never throws "missing credentials".
 *
 * @module Binance
 */

import { logger } from '@/lib/logger';
import type {
  BinancePayClient,
  BinancePayCreateOrderParams,
  BinancePayOrderResult,
} from './types';

export type {
  BinancePayCheckout,
  BinancePayClient,
  BinancePayCreateOrderParams,
  BinancePayOrderResult,
} from './types';

function isPlaceholder(value: string | undefined): boolean {
  return !value || value.startsWith('PLACEHOLDER');
}

/**
 * Sandbox implementation — succeeds unless merchantTradeNo starts with FAIL_.
 *
 * @returns BinancePayClient that never calls the network
 */
export function createSandboxBinancePayClient(): BinancePayClient {
  return {
    async createOrder(params: BinancePayCreateOrderParams) {
      return {
        prepayId: `SANDBOX_PREPAY_${params.merchantTradeNo}`,
        checkoutUrl: `https://sandbox.binance.com/pay?prepayId=SANDBOX_PREPAY_${params.merchantTradeNo}`,
      };
    },
    async queryOrder(merchantTradeNo: string): Promise<BinancePayOrderResult> {
      if (merchantTradeNo.startsWith('FAIL_')) {
        return { status: 'FAIL', merchantTradeNo };
      }
      return {
        status: 'PAID',
        merchantTradeNo,
        transactionId: `SANDBOX_TX_${Date.now()}`,
        paidAmount: '10.000000',
        paidCurrency: 'USDT',
        paidTime: new Date().toISOString(),
      };
    },
  };
}

/**
 * Real client factory. Uses sandbox when env values are placeholders.
 *
 * @returns Sandbox client, or throws until Phase 5 implements live Pay
 */
export function createBinancePayClient(): BinancePayClient {
  const apiKey = process.env.BINANCE_PAY_API_KEY;
  const apiSecret = process.env.BINANCE_PAY_API_SECRET;
  const merchantId = process.env.BINANCE_PAY_MERCHANT_ID;

  if (isPlaceholder(apiKey) || isPlaceholder(apiSecret) || isPlaceholder(merchantId)) {
    logger.warn('Binance Pay real credentials not set — using sandbox client');
    return createSandboxBinancePayClient();
  }

  throw new Error('Real Binance Pay client not yet implemented — add in Phase 5');
}
