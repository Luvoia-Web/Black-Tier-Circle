/**
 * @file lib/fulfillment-config.ts
 *
 * Fulfillment and delivery configuration.
 * All timeouts, retry limits, and delivery settings in one place.
 * Change behavior here — never in feature code.
 */

export const FULFILLMENT_CONFIG = {
  /** Signed URL expiry for file delivery (seconds) */
  downloadUrlExpirySeconds: 3600, // 1 hour

  /** How long before a queued fulfillment is considered stuck */
  fulfillmentTimeoutMinutes: 30,

  /** Max delivery attempts before marking unreachable */
  maxDeliveryAttempts: 3,

  /** Seconds between delivery retry attempts */
  deliveryRetryIntervalSeconds: 60,

  /** Manual fulfillment: hours before owner is reminded */
  manualFulfillmentReminderHours: 2,

  delivery: {
    /** Message sent to customer along with the file */
    fileDeliveryCaption: (productTitle: string) =>
      `✅ *Your order is ready!*\n\n📦 *${productTitle}*\n\nHere is your file. Enjoy!\n\n_This link expires in 1 hour. Download it now._`,

    /** Message when manual delivery is pending */
    manualDeliveryPending: (estimatedMinutes: number | null) =>
      `✅ *Payment confirmed!*\n\nYour order is being prepared.${estimatedMinutes ? ` Estimated delivery: ~${estimatedMinutes} minutes.` : ''}\n\nWe will send it to you here shortly.`,

    /** Message when a manual order has been fulfilled */
    orderDelivered: '✅ Your order has been delivered! Enjoy your purchase.',

    /** Message when delivery fails after all retries */
    deliveryFailed:
      '⚠️ We had trouble delivering your order. Our team has been notified and will reach out to you.',
  },
} as const;
