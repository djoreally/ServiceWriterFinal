/**
 * Service Dependencies Query
 *
 * The legacy service template dependency library was retired from production.
 * Return the historical empty result shape so callers remain stable.
 */

export async function fetchServiceDependenciesData() {
  return Promise.all([
    Promise.resolve({ data: [], error: null }),
    Promise.resolve({ data: [], error: null }),
  ]);
}
