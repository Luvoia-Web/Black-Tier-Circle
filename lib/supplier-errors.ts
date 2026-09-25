/**
 * Turns raw supplier API failures into short English messages.
 */

export function translateSupplierError(error: unknown, statusCode?: number): string {
  const msg = error instanceof Error ? error.message.toLowerCase() : '';
  const status = statusCode ?? 0;

  if (msg.includes('solde insuffisant') || msg.includes('insufficient')) {
    return 'API key is valid but your supplier balance is low. You can still connect — top up your supplier wallet before ordering.';
  }
  if (msg.includes('clé api') || msg.includes('api key') || status === 401) {
    return 'Invalid API key. Please check your key and try again.';
  }
  if (status === 403) {
    return 'This API key does not have the required permissions.';
  }
  if (status === 404) {
    return 'Supplier API endpoint not found. Check the endpoint URL.';
  }
  if (status === 429) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  if (msg.includes('enotfound') || msg.includes('network') || msg.includes('fetch')) {
    return 'Cannot reach the supplier API. Check the endpoint URL and your internet connection.';
  }
  if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('timed out')) {
    return 'Connection timed out. The supplier API is not responding. Try again.';
  }
  return 'Could not connect to supplier. Please check your API key and try again.';
}

export function isLowBalanceMessage(message: string): boolean {
  const msg = message.toLowerCase();
  return msg.includes('solde insuffisant') || msg.includes('insufficient');
}
