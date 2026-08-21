import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import { isOfflineEligibilityConfigured } from '@/offline/rollout';
import { offlineSchema } from './schema';
import { offlineMigrations } from './migrations';
import { OfflineAppointment } from './models/OfflineAppointment';
import { OfflineCustomer } from './models/OfflineCustomer';
import { OfflineVehicle } from './models/OfflineVehicle';
import { OfflineOutbox } from './models/OfflineOutbox';
import { OfflineSyncState } from './models/OfflineSyncState';
import { OfflineFleetWorkOrder } from './models/OfflineFleetWorkOrder';
import { OfflineServiceCatalogItem } from './models/OfflineServiceCatalogItem';
import { OfflineTechnicianMessage } from './models/OfflineTechnicianMessage';

let offlineDatabase: Database | null = null;

/**
 * @internal DB initialization guard only.
 * Do NOT use this for eligibility decisions — use isOfflineEligibleForUser() or
 * isOfflineEligibleForCurrentUser() from @/offline/rollout instead.
 */
export function isOfflineEngineEnabled(): boolean {
  return isOfflineEligibilityConfigured();
}

let offlineDatabaseInitFailed = false;

export function getOfflineDatabase(): Database | null {
  if (!isOfflineEngineEnabled()) {
    return null;
  }

  if (offlineDatabase) {
    return offlineDatabase;
  }

  if (offlineDatabaseInitFailed) {
    return null;
  }

  const isBrowser = typeof window !== 'undefined';
  if (!isBrowser) {
    // Optimization + stability: avoid importing/initializing Node-only sqlite adapter paths
    // in web builds. This prevents better-sqlite3 module resolution errors and trims client bundle work.
    return null;
  }

  // Wrap construction so that a broken adapter (e.g. missing worker, minified
  // interop failure like "A is not a constructor") does not crash consumer
  // pages such as Customers / Vehicles that fall back to the offline snapshot.
  try {
    const adapter = new LokiJSAdapter({
      schema: offlineSchema,
      dbName: 'service-writer-offline',
      migrations: offlineMigrations,
      // Required by WatermelonDB: without it the adapter throws and the whole
      // offline layer is disabled for the session.
      useWebWorker: false,
      useIncrementalIndexedDB: true,
    });

    offlineDatabase = new Database({
      adapter,
      modelClasses: [
        OfflineAppointment,
        OfflineCustomer,
        OfflineVehicle,
        OfflineOutbox,
        OfflineSyncState,
        OfflineFleetWorkOrder,
        OfflineServiceCatalogItem,
        OfflineTechnicianMessage,
      ],
    });

    return offlineDatabase;
  } catch (error) {
    offlineDatabaseInitFailed = true;
    console.warn('[offline] database init failed; disabling offline layer for this session', error);
    return null;
  }
}

