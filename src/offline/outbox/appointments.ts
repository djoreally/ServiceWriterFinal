import { Q } from '@nozbe/watermelondb';
import { getOfflineDatabase } from '@/offline/database';
import { queueAppointmentStatusForSync as enqueueAppointmentStatusUpdate, processOfflineOutbox } from './index';

export async function queueAppointmentStatusForSync(
  appointmentId: string,
  status: string,
): Promise<void> {
  const database = getOfflineDatabase();
  if (!database) {
    throw new Error('Offline database is not available');
  }

  const now = Date.now();

  await database.write(async (): Promise<void> => {
    const appointments = database.get('offline_appointments');
    const localRows = await appointments.query(Q.where('server_id', appointmentId)).fetch();

    if (localRows.length > 0) {
      await localRows[0].update((record: any) => {
        record._raw.status = status;
        record._raw.sync_status = 'pending';
        record._raw.updated_at_local = now;
      });
    }
  });

  await enqueueAppointmentStatusUpdate(appointmentId, status);

  // Fire an immediate best-effort push attempt; retry loop handles failures.
  await processOfflineOutbox();
}
