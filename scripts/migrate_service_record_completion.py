import re
from pathlib import Path

path = Path('/home/ubuntu/ServiceWriterFinal/src/application/commands/service-record.command.ts')
text = path.read_text()
pattern = r'(?ms)^export async function completeAppointmentWithServiceRecord\(.*?^/\*\*\n \* Update service record status'
replacement = '''export async function completeAppointmentWithServiceRecord(
  appointmentId: string,
  options?: {
    technician?: string;
    additionalNotes?: string;
    laborHours?: number;
    mileage?: number;
    vin?: string;
    filterParts?: FilterPart[];
    oilQuartsUsed?: number;
    oilType?: string;
  }
): Promise<{ success: boolean; serviceId?: string; error?: string }> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) return { success: false, error: 'Select a workspace before completing a service record.' };
  try {
    const filterParts = options?.filterParts?.length
      ? formatFilterPartsForDisplay(options.filterParts)
      : null;
    const completion = await nextApi.appointments.complete(appointmentId, workspace_id);
    const appointment = completion.data as Record<string, unknown> | null;
    const service = await nextApi.serviceRecords.create({
      workspace_id,
      appointment_id: appointmentId,
      status: 'completed',
      started_at: null,
      completed_at: new Date().toISOString(),
      work_performed: options?.additionalNotes ?? 'Completed service',
      oil_quarts_used: options?.oilQuartsUsed ?? null,
      metadata: {
        technician: options?.technician ?? null,
        labor_hours: options?.laborHours ?? null,
        mileage: options?.mileage ?? null,
        vin: options?.vin ?? null,
        oil_type: options?.oilType?.trim() || null,
        filter_parts: filterParts,
        appointment_completion: appointment,
      },
    });
    const serviceRecord = service.data as { id?: string } | null;
    return { success: true, serviceId: serviceRecord?.id };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Failed to complete appointment:', err);
    const msg = err.message || 'Failed to complete appointment';
    const friendlyMap: Record<string, string> = {
      'Vehicle oil type must be recorded': 'Please set the vehicle\\'s oil type before completing this oil service. Go to the vehicle profile and update the oil type field.',
      'Oil services require confirmed oil quantity': 'Oil quantity is required. Please enter the number of quarts used.',
      'Oil services require filter replacement': 'Filter/parts confirmation is required for oil services.',
      'Captured VIN does not match': 'The VIN entered does not match the vehicle on file. Please verify.',
    };
    return { success: false, error: Object.entries(friendlyMap).find(([key]) => msg.includes(key))?.[1] ?? msg };
  }
}
/**
 * Update service record status'''
updated, count = re.subn(pattern, replacement, text, count=1)
if count != 1:
    raise SystemExit(f'completion function replacement count={count}')
path.write_text(updated)
print('migrated appointment completion to API bridge')
