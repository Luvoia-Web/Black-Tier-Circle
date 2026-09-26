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
    fileDeliveryCaption: (productTitle: string, orderRef?: string) => {
      const title = productTitle.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const ref = orderRef?.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `🎉 <b>Your order is ready!</b>\n\n📦 <b>${title}</b>\n\nHere is your file.\n\n${ref ? `✅ Order <code>${ref}</code> complete.\n` : ''}Thank you for your purchase!\n\nNeed help? /support`;
    },

    /** Message when manual delivery is pending */
    manualDeliveryPending: (estimatedMinutes: number | null) =>
      `✅ <b>Payment confirmed!</b>\n\nYour order is being prepared.${estimatedMinutes ? ` Estimated delivery: ~${estimatedMinutes} minutes.` : ''}\n\nWe will send it to you here shortly.`,

    /** Message when a manual order has been fulfilled */
    orderDelivered: '✅ Your order has been delivered! Enjoy your purchase.',

    /** Message when delivery fails after all retries */
    deliveryFailed:
      '⚠️ We had trouble delivering your order. Our team has been notified and will reach out to you.',
  },
} as const;
