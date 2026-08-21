/**
 * Checkout error states with recovery paths
 * Each error type has specific UI copy and action
 */

export type CheckoutErrorType = 
  | 'card_declined'
  | 'provider_not_enabled'
  | 'stripe_outage'
  | 'webhook_delay'
  | 'duplicate_checkout'
  | 'price_changed'
  | 'slot_taken'
  | 'network_error'
  | 'rate_limit'
  | 'unknown';
  
/**
 * Parse error response to determine error type
 */
export function parseCheckoutError(error: unknown): { type: CheckoutErrorType; message?: string } {
  // Safely extract a human-readable message from any error shape
  // Supabase PostgrestError has .message; edge-function errors may have .error_description
  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null
        ? (error as Record<string, unknown>).message as string
          ?? (error as Record<string, unknown>).error_description as string
          ?? JSON.stringify(error)
        : String(error);
  const lowerMessage = (errorMessage ?? "").toLowerCase();

  if (lowerMessage.includes('declined') || lowerMessage.includes('card_declined')) {
    return { type: 'card_declined', message: errorMessage };
  }
  if (lowerMessage.includes('not enabled') || lowerMessage.includes('charges_enabled')) {
    return { type: 'provider_not_enabled', message: errorMessage };
  }
  if (lowerMessage.includes('slot') || lowerMessage.includes('time') && lowerMessage.includes('unavailable')) {
    return { type: 'slot_taken', message: errorMessage };
  }
  if (lowerMessage.includes('price') && (lowerMessage.includes('changed') || lowerMessage.includes('expired'))) {
    return { type: 'price_changed', message: errorMessage };
  }
  if (lowerMessage.includes('duplicate') || lowerMessage.includes('already')) {
    return { type: 'duplicate_checkout', message: errorMessage };
  }
  if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many') || lowerMessage.includes('please wait')) {
    return { type: 'rate_limit', message: errorMessage };
  }
  if (lowerMessage.includes('network') || lowerMessage.includes('fetch') || lowerMessage.includes('connection')) {
    return { type: 'network_error', message: errorMessage };
  }
  if (lowerMessage.includes('stripe') || lowerMessage.includes('outage')) {
    return { type: 'stripe_outage', message: errorMessage };
  }

  return { type: 'unknown', message: errorMessage };
}
