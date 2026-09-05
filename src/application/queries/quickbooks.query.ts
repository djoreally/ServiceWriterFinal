/**
 * QuickBooks integration has been sunset.
 *
 * This compatibility module intentionally performs no database or provider I/O.
 * It remains temporarily so older imports compile while the UI surface is removed.
 */
export async function fetchQBOData() {
  return null;
}
