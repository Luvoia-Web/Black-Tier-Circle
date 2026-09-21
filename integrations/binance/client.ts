/**
 * @file integrations/binance/client.ts
 *
 * Binance Pay merchant client.
 *
 * DEMO MODE (default): sandbox adapter — no real API calls.
 * LIVE MODE: activated automatically when real env vars are set.
 * Switch: set BINANCE_PAY_API_KEY, BINANCE_PAY_API_SECRET, BINANCE_PAY_MERCHANT_ID in .env
 *
 * Signature scheme (live mode):
 * nonce     = crypto.randomBytes(32).toString('hex').slice(0, 32)
 * timestamp = Date.now().toString()
 * payload   = timestamp + '\n' + nonce + '\n' + JSON.stringify(body) + '\n'
 * signature = HMAC-SHA512(payload, apiSecret).toUpperCase()
 * Headers   = BinancePay-Timestamp, BinancePay-Nonce,
 *             BinancePay-Certificate-SN (= apiKey),
 *             BinancePay-Signature
 *
 * To switch to live: add real credentials to .env — zero code changes.
 */

import { createHmac, randomBytes } from 'node:crypto';
import { PaymentError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { PAYMENT_CONFIG } from '@/lib/payment-config';
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

const sandboxPaidAmounts = new Map<string, string>();

type BinanceApiResponse = {
  readonly status?: string;
  readonly errorMessage?: string;
  readonly data?: {
    readonly prepayId?: string;
    readonly checkoutUrl?: string;
    readonly status?: BinancePayOrderResult['status'];
    readonly merchantTradeNo?: string;
    readonly transactionId?: string;
    readonly orderAmount?: string;
    readonly currency?: string;
    readonly transactTime?: number;
  };
};

/**
 * Builds Binance Pay request headers (HMAC-SHA512).
 *
 * @param apiKey - Certificate serial / API key
 * @param apiSecret - HMAC secret
 * @param body - JSON body that will be sent
 */
export function buildBinancePayHeaders(
  apiKey: string,
  apiSecret: string,
  body: unknown,
): Record<string, string> {
  const nonce = randomBytes(32).toString('hex').slice(0, 32);
  const timestamp = Date.now().toString();
  const payload = `${timestamp}\n${nonce}\n${JSON.stringify(body)}\n`;
  const signature = createHmac('sha512', apiSecret).update(payload).digest('hex').toUpperCase();
  return {
    'Content-Type': 'application/json',
    'BinancePay-Timestamp': timestamp,
    'BinancePay-Nonce': nonce,
    'BinancePay-Certificate-SN': apiKey,
    'BinancePay-Signature': signature,
  };
}

/**
 * Verifies an inbound Binance Pay webhook signature.
 *
 * @param apiSecret - HMAC secret
 * @param timestamp - BinancePay-Timestamp header
 * @param nonce - BinancePay-Nonce header
 * @param rawBody - Raw JSON body string
 * @param signature - BinancePay-Signature header
 */
export function verifyBinancePaySignature(
  apiSecret: string,
  timestamp: string,
  nonce: string,
  rawBody: string,
  signature: string,
): boolean {
  if (!apiSecret || !timestamp || !nonce || !signature) {
    return false;
  }
  const payload = `${timestamp}\n${nonce}\n${rawBody}\n`;
  const expected = createHmac('sha512', apiSecret).update(payload).digest('hex').toUpperCase();
  return expected === signature.toUpperCase();
}

/**
 * Sandbox implementation — succeeds unless merchantTradeNo starts with FAIL_.
 *
 * @returns BinancePayClient that never calls the network
 */
export function createSandboxBinancePayClient(): BinancePayClient {
  return {
    async createOrder(params: BinancePayCreateOrderParams) {
      sandboxPaidAmounts.set(params.merchantTradeNo, params.orderAmount);
      return {
        prepayId: `SANDBOX_PREPAY_${params.merchantTradeNo}`,
        checkoutUrl: `https://sandbox.binance.com/pay?prepayId=SANDBOX_PREPAY_${params.merchantTradeNo}`,
      };
    },
    async queryOrder(merchantTradeNo: string): Promise<BinancePayOrderResult> {
      if (merchantTradeNo.startsWith(PAYMENT_CONFIG.demo.failPrefix)) {
        return { status: 'FAIL', merchantTradeNo };
      }
      const paidAmount = sandboxPaidAmounts.get(merchantTradeNo) ?? '10.000000';
      return {
        status: 'PAID',
        merchantTradeNo,
        transactionId: `SANDBOX_TX_${Date.now()}`,
        paidAmount,
        paidCurrency: 'USDT',
        paidTime: new Date().toISOString(),
      };
    },
  };
}

function createRealBinancePayClient(apiKey: string, apiSecret: string): BinancePayClient {
  const { baseUrl, currency, merchantId } = PAYMENT_CONFIG.binancePay;

  function buildHeaders(body: unknown): Record<string, string> {
    return buildBinancePayHeaders(apiKey, apiSecret, body);
  }

  return {
    async createOrder(params) {
      const body = {
        env: { terminalType: 'WEB' },
        merchantId,
        merchantTradeNo: params.merchantTradeNo,
        orderAmount: params.orderAmount,
        currency,
        goods: {
          goodsType: '01',
          goodsCategory: 'Z000',
          referenceGoodsId: params.merchantTradeNo,
          goodsName: params.goods.goodsName.slice(0, 256),
          goodsDetail: params.goods.goodsDetail?.slice(0, 256),
        },
      };
      const res = await fetch(`${baseUrl}/binancepay/openapi/v2/order`, {
        method: 'POST',
        headers: buildHeaders(body),
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as BinanceApiResponse;
      if (data.status !== 'SUCCESS' || !data.data?.prepayId || !data.data.checkoutUrl) {
        throw new PaymentError(
          'BINANCE_CREATE_FAILED',
          data.errorMessage ?? 'Binance Pay order creation failed',
        );
      }
      return {
        prepayId: data.data.prepayId,
        checkoutUrl: data.data.checkoutUrl,
      };
    },

    async queryOrder(merchantTradeNo) {
      const body = { merchantTradeNo };
      const res = await fetch(`${baseUrl}/binancepay/openapi/v2/order/query`, {
        method: 'POST',
        headers: buildHeaders(body),
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as BinanceApiResponse;
      if (data.status !== 'SUCCESS' || !data.data) {
        throw new PaymentError('BINANCE_QUERY_FAILED', data.errorMessage ?? 'Binance Pay query failed');
      }
      const result: BinancePayOrderResult = {
        status: data.data.status ?? 'ERROR',
        merchantTradeNo: data.data.merchantTradeNo ?? merchantTradeNo,
      };
      if (data.data.transactionId !== undefined) {
        Object.assign(result, { transactionId: data.data.transactionId });
      }
      if (data.data.orderAmount !== undefined) {
        Object.assign(result, { paidAmount: data.data.orderAmount });
      }
      if (data.data.currency !== undefined) {
        Object.assign(result, { paidCurrency: data.data.currency });
      }
      if (data.data.transactTime) {
        Object.assign(result, { paidTime: new Date(data.data.transactTime).toISOString() });
      }
      return result;
    },
  };
}

/**
 * Factory — auto-selects demo or real based on PAYMENT_CONFIG.mode
 */
export function createBinancePayClient(): BinancePayClient {
  if (PAYMENT_CONFIG.mode === 'live') {
    return createRealBinancePayClient(
      PAYMENT_CONFIG.binancePay.apiKey,
      PAYMENT_CONFIG.binancePay.apiSecret,
    );
  }
  logger.warn('Binance Pay DEMO MODE — no real payments processed');
  return createSandboxBinancePayClient();
}
