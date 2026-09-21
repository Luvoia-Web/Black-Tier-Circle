/**
 * @file integrations/binance/types.ts
 *
 * Binance Pay adapter input and output types.
 *
 * @module Binance
 */

export type BinancePayCreateOrderParams = {
  readonly merchantTradeNo: string;
  readonly orderAmount: string;
  readonly currency: 'USDT';
  readonly goods: { readonly goodsName: string; readonly goodsDetail?: string };
};

export type BinancePayOrderResult = {
  readonly status: 'SUCCESS' | 'FAIL' | 'INITIAL' | 'PENDING' | 'PAID' | 'EXPIRED' | 'ERROR';
  readonly merchantTradeNo: string;
  readonly transactionId?: string;
  readonly paidAmount?: string;
  readonly paidCurrency?: string;
  readonly paidTime?: string;
};

export type BinancePayCheckout = {
  readonly prepayId: string;
  readonly checkoutUrl: string;
};

export interface BinancePayClient {
  createOrder(params: BinancePayCreateOrderParams): Promise<BinancePayCheckout>;
  queryOrder(merchantTradeNo: string): Promise<BinancePayOrderResult>;
}
