-- CRM capability hardening.
-- Keep the implementation outside the exposed public API schema. The public
-- wrapper is intentionally invoker-only so the API bridge can ask one boolean
-- question without exposing a public security-definer implementation.

begin;

create schema if not exists private;

create or replace function private.has_crm_capability(
  target_workspace_id uuid,
  required_capability text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when required_capability not in (
      'crm.view', 'crm.profile.write', 'crm.lead.write', 'crm.task.write',
      'crm.segment.manage', 'crm.campaign.draft', 'crm.campaign.approve',
      'crm.campaign.send', 'crm.loyalty.adjust', 'crm.export', 'crm.settings.manage'
    ) then false
    else exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = target_workspace_id
        and wm.user_id = auth.uid()
        and wm.is_active
        and wm.role::text in ('owner', 'admin', 'manager')
    )
    or exists (
      select 1
      from public.crm_permissions cp
      join public.workspace_members wm
        on wm.workspace_id = cp.workspace_id
       and wm.user_id = cp.user_id
       and wm.is_active
      where cp.workspace_id = target_workspace_id
        and cp.user_id = auth.uid()
        and cp.capability = required_capability
    )
  end;
$$;

create or replace function public.has_crm_capability(
  target_workspace_id uuid,
  required_capability text
)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select private.has_crm_capability(target_workspace_id, required_capability);
$$;

revoke all on function private.has_crm_capability(uuid, text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.has_crm_capability(uuid, text) to authenticated;
revoke all on function public.has_crm_capability(uuid, text) from public, anon;
grant execute on function public.has_crm_capability(uuid, text) to authenticated;

-- Rebind CRM policies to the non-exposed implementation. This also makes
-- capability checks in RLS use the same active-membership rule as the bridge.
drop policy if exists crm_profiles_select on public.crm_profiles;
create policy crm_profiles_select on public.crm_profiles for select to authenticated using (private.has_crm_capability(workspace_id, 'crm.view'));
drop policy if exists crm_profiles_write on public.crm_profiles;
create policy crm_profiles_write on public.crm_profiles for insert to authenticated with check (private.has_crm_capability(workspace_id, 'crm.profile.write'));
drop policy if exists crm_profiles_update on public.crm_profiles;
create policy crm_profiles_update on public.crm_profiles for update to authenticated using (private.has_crm_capability(workspace_id, 'crm.profile.write')) with check (private.has_crm_capability(workspace_id, 'crm.profile.write'));

drop policy if exists crm_activities_select on public.crm_activities;
create policy crm_activities_select on public.crm_activities for select to authenticated using (private.has_crm_capability(workspace_id, 'crm.view'));
drop policy if exists crm_activities_insert on public.crm_activities;
create policy crm_activities_insert on public.crm_activities for insert to authenticated with check (private.has_crm_capability(workspace_id, 'crm.task.write'));

drop policy if exists crm_leads_member_select on public.crm_leads;
create policy crm_leads_member_select on public.crm_leads for select to authenticated using (private.has_crm_capability(workspace_id, 'crm.view'));
drop policy if exists crm_leads_member_write on public.crm_leads;
create policy crm_leads_member_write on public.crm_leads for all to authenticated using (private.has_crm_capability(workspace_id, 'crm.lead.write')) with check (private.has_crm_capability(workspace_id, 'crm.lead.write'));

drop policy if exists crm_tasks_member_select on public.crm_tasks;
create policy crm_tasks_member_select on public.crm_tasks for select to authenticated using (private.has_crm_capability(workspace_id, 'crm.view'));
drop policy if exists crm_tasks_member_write on public.crm_tasks;
create policy crm_tasks_member_write on public.crm_tasks for all to authenticated using (private.has_crm_capability(workspace_id, 'crm.task.write')) with check (private.has_crm_capability(workspace_id, 'crm.task.write'));

drop policy if exists crm_segments_member_select on public.crm_segments;
create policy crm_segments_member_select on public.crm_segments for select to authenticated using (private.has_crm_capability(workspace_id, 'crm.view'));
drop policy if exists crm_segments_manage on public.crm_segments;
create policy crm_segments_manage on public.crm_segments for all to authenticated using (private.has_crm_capability(workspace_id, 'crm.segment.manage')) with check (private.has_crm_capability(workspace_id, 'crm.segment.manage'));

drop policy if exists crm_campaigns_member_select on public.crm_campaigns;
create policy crm_campaigns_member_select on public.crm_campaigns for select to authenticated using (private.has_crm_capability(workspace_id, 'crm.view'));
drop policy if exists crm_campaigns_draft on public.crm_campaigns;
create policy crm_campaigns_draft on public.crm_campaigns for insert to authenticated with check (private.has_crm_capability(workspace_id, 'crm.campaign.draft'));
drop policy if exists crm_campaigns_update on public.crm_campaigns;
create policy crm_campaigns_update on public.crm_campaigns for update to authenticated using (private.has_crm_capability(workspace_id, 'crm.campaign.draft')) with check (private.has_crm_capability(workspace_id, 'crm.campaign.draft'));

drop policy if exists crm_campaign_members_select on public.crm_campaign_members;
create policy crm_campaign_members_select on public.crm_campaign_members for select to authenticated using (private.has_crm_capability(workspace_id, 'crm.view'));
drop policy if exists crm_campaign_members_write on public.crm_campaign_members;
create policy crm_campaign_members_write on public.crm_campaign_members for all to authenticated using (private.has_crm_capability(workspace_id, 'crm.campaign.send')) with check (private.has_crm_capability(workspace_id, 'crm.campaign.send'));

drop policy if exists crm_loyalty_accounts_select on public.crm_loyalty_accounts;
create policy crm_loyalty_accounts_select on public.crm_loyalty_accounts for select to authenticated using (private.has_crm_capability(workspace_id, 'crm.view'));
drop policy if exists crm_loyalty_accounts_write on public.crm_loyalty_accounts;
create policy crm_loyalty_accounts_write on public.crm_loyalty_accounts for all to authenticated using (private.has_crm_capability(workspace_id, 'crm.loyalty.adjust')) with check (private.has_crm_capability(workspace_id, 'crm.loyalty.adjust'));

drop policy if exists crm_loyalty_ledger_select on public.crm_loyalty_ledger;
create policy crm_loyalty_ledger_select on public.crm_loyalty_ledger for select to authenticated using (private.has_crm_capability(workspace_id, 'crm.view'));
drop policy if exists crm_loyalty_ledger_insert on public.crm_loyalty_ledger;
create policy crm_loyalty_ledger_insert on public.crm_loyalty_ledger for insert to authenticated with check (private.has_crm_capability(workspace_id, 'crm.loyalty.adjust'));

drop policy if exists crm_audit_events_select on public.crm_audit_events;
create policy crm_audit_events_select on public.crm_audit_events for select to authenticated using (private.has_crm_capability(workspace_id, 'crm.view'));
drop policy if exists crm_audit_events_insert on public.crm_audit_events;
create policy crm_audit_events_insert on public.crm_audit_events for insert to authenticated with check (private.has_crm_capability(workspace_id, 'crm.view'));

commit;
