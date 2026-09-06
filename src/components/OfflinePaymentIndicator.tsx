/**
 * Compatibility shell for the retired offline payment queue.
 *
 * Offline financial writes are intentionally disabled. Payments must be posted
 * through the canonical, online payment API so provenance and duplicate guards
 * are enforced server-side.
 */
export const OfflinePaymentIndicator = () => null;
export default OfflinePaymentIndicator;
