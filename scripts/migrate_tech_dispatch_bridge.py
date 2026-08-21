import re
from pathlib import Path

path = Path('/home/ubuntu/ServiceWriterFinal/src/application/commands/tech-dispatch.command.ts')
text = path.read_text()
text = text.replace('import { supabase } from "@/integrations/supabase/client";\n\nimport { getCurrentAuthUser } from "@/lib/auth/current-user";', 'import { supabase } from "@/integrations/supabase/client";\nimport { nextApi } from "@/lib/nextApiClient";\nimport { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";\n\nimport { getCurrentAuthUser } from "@/lib/auth/current-user";')

def replace(name, next_marker, body):
    global text
    if next_marker == 'end of file':
        pattern = rf'(?ms)^export async function {re.escape(name)}\(.*\Z'
    else:
        pattern = rf'(?ms)^export async function {re.escape(name)}\(.*?(?=^/\*\*\n \* {re.escape(next_marker)})'
    new, count = re.subn(pattern, body.rstrip() + '\\n\\n', text, count=1)
    if count != 1:
        raise SystemExit(f'{name}: replacement count={count}')
    text = new

replace('acceptJobAssignment', 'Mark technician en route to job', '''export async function acceptJobAssignment(appointment_id: string): Promise<any> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error('Select a workspace before acknowledging a job.');
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error('Not authenticated');
  const { data: tech } = await supabase.from('technicians').select('id').eq('auth_user_id', user.id).single();
  await nextApi.appointments.update(appointment_id, { workspace_id, dispatch_status: 'acknowledged' });
  await nextApi.dispatchEvents.create({ workspace_id, appointment_id, technician_id: tech?.id ?? null, event_type: 'status_changed', new_status: 'acknowledged', notes: 'Technician acknowledged job assignment' });
  return { success: true };
}''')
replace('markEnRoute', 'Mark technician arrived at job site', '''export async function markEnRoute(appointment_id: string, location?: { lat: number; lng: number }): Promise<any> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error('Select a workspace before marking a job en route.');
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error('Not authenticated');
  const { data: tech } = await supabase.from('technicians').select('id').eq('auth_user_id', user.id).single();
  if (!tech) throw new Error('Technician not found');
  await nextApi.appointments.update(appointment_id, { workspace_id, dispatch_status: 'en_route' });
  await nextApi.dispatchEvents.create({ workspace_id, appointment_id, technician_id: tech.id, event_type: 'en_route', new_status: 'en_route', location: location ?? null, notes: 'Technician is en route' });
  return { success: true };
}''')
replace('markArrived', 'Start work on job', '''export async function markArrived(appointment_id: string, location?: { lat: number; lng: number }): Promise<any> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error('Select a workspace before marking arrival.');
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error('Not authenticated');
  const { data: tech } = await supabase.from('technicians').select('id').eq('auth_user_id', user.id).single();
  if (!tech) throw new Error('Technician not found');
  await nextApi.appointments.update(appointment_id, { workspace_id, dispatch_status: 'arrived' });
  await nextApi.dispatchEvents.create({ workspace_id, appointment_id, technician_id: tech.id, event_type: 'arrived', new_status: 'arrived', location: location ?? null, notes: 'Technician arrived at job site' });
  return { success: true };
}''')
replace('startJob', 'end of file', '''export async function startJob(appointment_id: string): Promise<any> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error('Select a workspace before starting a job.');
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error('Not authenticated');
  const { data: tech } = await supabase.from('technicians').select('id').eq('auth_user_id', user.id).single();
  await nextApi.appointments.update(appointment_id, { workspace_id, dispatch_status: 'in_progress', actual_start_time: new Date().toISOString() });
  await nextApi.dispatchEvents.create({ workspace_id, appointment_id, technician_id: tech?.id ?? null, event_type: 'started', new_status: 'in_progress', notes: 'Technician started work' });
  return { success: true };
}''')
path.write_text(text)
print('migrated technician appointment dispatch writes')
