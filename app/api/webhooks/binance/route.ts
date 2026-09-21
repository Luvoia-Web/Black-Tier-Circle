/**
 * @file app/api/webhooks/binance/route.ts
 *
 * Binance Pay webhook.
 * SECURITY: Verify BinancePay-Signature header before any processing.
 * Always return 200 with { returnCode: "SUCCESS" } — Binance retries on non-200.
 * In demo mode: log the webhook but don't process (no real payments expected).
 *
 * @module Api
 */

import { NextResponse } from 'next/server';
import { verifyBinancePaySignature } from '@/integrations/binance/client';
import { asDbClient } from '@/lib/auth/session';
import { logger } from '@/lib/logger';
import { PAYMENT_CONFIG } from '@/lib/payment-config';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { getOrder } from '@/modules/orders';
import { orderIdFromMerchantTradeNo, verifyBinancePayClaim } from '@/modules/payments';

export const dynamic = 'force-dynamic';

const SUCCESS = { returnCode: 'SUCCESS' };

type BinanceWebhookBody = {
  readonly bizType?: string;
  readonly data?: string | Record<string, unknown>;
};

function merchantTradeNoFromPayload(payload: BinanceWebhookBody): string | null {
  if (typeof payload.data === 'string') {
    try {
      const inner = JSON.parse(payload.data) as { merchantTradeNo?: string };
      return inner.merchantTradeNo ?? null;
    } catch {
      return null;
    }
  }
  if (payload.data && typeof payload.data === 'object' && 'merchantTradeNo' in payload.data) {
    const value = payload.data.merchantTradeNo;
    return typeof value === 'string' ? value : null;
  }
  return null;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const rawBody = await request.text();
    if (PAYMENT_CONFIG.mode === 'demo') {
      logger.info('binance webhook ignored in demo mode', { bizType: 'demo' });
      return NextResponse.json(SUCCESS);
    }

    const timestamp = request.headers.get('BinancePay-Timestamp') ?? '';
    const nonce = request.headers.get('BinancePay-Nonce') ?? '';
    const signature = request.headers.get('BinancePay-Signature') ?? '';
    const valid = verifyBinancePaySignature(
      PAYMENT_CONFIG.binancePay.apiSecret,
      timestamp,
      nonce,
      rawBody,
      signature,
    );
    if (!valid) {
      logger.warn('binance webhook signature rejected');
      return NextResponse.json(SUCCESS);
    }

    let payload: BinanceWebhookBody = {};
    try {
      payload = JSON.parse(rawBody) as BinanceWebhookBody;
    } catch {
      return NextResponse.json(SUCCESS);
    }

    const merchantTradeNo = merchantTradeNoFromPayload(payload);
    const orderId = merchantTradeNo ? orderIdFromMerchantTradeNo(merchantTradeNo) : null;
    if (orderId && merchantTradeNo) {
      const db = asDbClient(createAdminSupabaseClient());
      try {
        await getOrder(db, orderId);
        await verifyBinancePayClaim(db, { orderId, binanceOrderId: merchantTradeNo });
      } catch {
        logger.warn('binance webhook order processing failed');
      }
    }
    return NextResponse.json(SUCCESS);
  } catch {
    return NextResponse.json(SUCCESS);
  }
}
