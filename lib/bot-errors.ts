/**
 * @file lib/bot-errors.ts
 *
 * Customer-facing Telegram errors. HTML parse mode.
 */

export const BOT_ERRORS = {
  INSUFFICIENT_BALANCE: (needed: string, have: string, shortfall: string): string =>
    `❌ <b>Insufficient Balance</b>\n\nYour balance: ${have} USDT\nRequired: ${needed} USDT\nShortfall: ${shortfall} USDT\n\nTop up your wallet and try again.`,

  ORDER_NOT_FOUND: `❌ <b>Order Not Found</b>\n\nUse /orders to see your active orders.`,

  ORDER_ALREADY_PAID: `✅ This order has already been paid. Use /orders to check its status.`,

  PAYMENT_VERIFICATION_FAILED: (method: string): string =>
    `❌ <b>Payment Not Verified</b>\n\nWe could not confirm your ${method} payment.\n\nPlease check:\n• The amount sent matches exactly\n• You sent the correct Order ID or transaction hash\n• The payment is complete, not still pending\n\nContact /support if this keeps happening.`,

  AMOUNT_MISMATCH: (expected: string, received: string): string =>
    `❌ <b>Amount Mismatch</b>\n\nExpected: ${expected}\nReceived: ${received}\n\nSend the exact amount, then try again or contact /support.`,

  BINANCE_TIMEOUT: `❌ <b>Binance Pay Timed Out</b>\n\nBinance did not respond in time. Wait a moment and send your Order ID again.\n\nContact /support if this keeps happening.`,

  TOKEN_NOT_FOUND: `❌ <b>Invalid Token</b>\n\nThis token does not exist. Check it and try again.`,

  TOKEN_ALREADY_USED: `❌ <b>Token Already Used</b>\n\nThis token has already been redeemed.`,

  TOKEN_EXPIRED: `❌ <b>Token Expired</b>\n\nThis token has expired. Contact the store owner for a new one.`,

  TOKEN_REVOKED: `❌ <b>Token Cancelled</b>\n\nThis token has been cancelled. Contact /support.`,

  PRODUCT_OUT_OF_STOCK: `❌ <b>Out of Stock</b>\n\nThis product is currently unavailable. Check back soon!`,

  STORE_MAINTENANCE: (message: string): string =>
    `🔧 <b>Store Temporarily Closed</b>\n\n${message || "We'll be back soon!"}\n\nThank you for your patience.`,

  GENERIC_ERROR: `⚠️ <b>Temporary Error</b>\n\nSomething went wrong on our end. Please try again in a moment.\n\nIf this keeps happening, contact /support`,
} as const;
