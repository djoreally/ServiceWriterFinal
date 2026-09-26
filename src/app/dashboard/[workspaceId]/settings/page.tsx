import { requirePageUser, requirePageWorkspace } from '@/server/auth/page-session';
import { getWorkspaceSettingsView } from '@/server/settings/workspace-settings';
import { updateWorkspaceSettingsAction } from './actions';

const SETTINGS_ROLES=new Set(['owner','admin','manager']);
export const dynamic='force-dynamic';

export default async function SettingsPage({
  params,
  searchParams,
}:{
  params:{workspaceId:string};
  searchParams?:{notice?:string;error?:string};
}){
  const user=await requirePageUser();
  const {workspace}=await requirePageWorkspace(user.id,params.workspaceId);
  const settings=await getWorkspaceSettingsView(params.workspaceId);
  if(!settings) return <main className="content"><div className="errorBox">Workspace settings were not found.</div></main>;
  const canEdit=SETTINGS_ROLES.has(workspace.role);

  return <main className="content">
    <div className="pageHeader"><h1>Settings</h1><p>Business, booking, payment, and policy settings for {settings.name}.</p></div>
    {searchParams?.notice?<div className="noticeBox">{searchParams.notice}</div>:null}
    {searchParams?.error?<div className="errorBox">{searchParams.error}</div>:null}

    <section className="card" style={{marginBottom:16}}>
      <div className="rowBetween">
        <div><div className="kicker">Payments</div><h2>Stripe connection</h2></div>
        <div>{settings.stripeConnection?.status==='connected'?<span className="noticeBox" style={{display:'inline-block',margin:0}}>Connected</span>:<span className="errorBox" style={{display:'inline-block',margin:0}}>Not connected</span>}</div>
      </div>
      <p className="subtle">{settings.stripeConnection?.externalAccountId?'Connected account: '+settings.stripeConnection.externalAccountId:'Card checkout stays disabled until Stripe Connect onboarding creates a provider connection.'}</p>
    </section>

    <form action={updateWorkspaceSettingsAction.bind(null,params.workspaceId)} className="stack">
      <section className="card">
        <h2>Business profile</h2>
        <div className="formGrid">
          <label>Business name<input name="name" defaultValue={settings.name} disabled={!canEdit}/></label>
          <label>Owner / contact name<input name="ownerName" defaultValue={settings.ownerName??''} disabled={!canEdit}/></label>
          <label>Email<input name="email" type="email" defaultValue={settings.email??''} disabled={!canEdit}/></label>
          <label>Phone<input name="phone" defaultValue={settings.phone??''} disabled={!canEdit}/></label>
          <label>Website<input name="websiteUrl" defaultValue={settings.websiteUrl??''} disabled={!canEdit}/></label>
          <label>Timezone<input name="timezone" defaultValue={settings.timezone} disabled={!canEdit}/></label>
          <label>Currency<input name="currencyCode" maxLength={3} defaultValue={settings.currencyCode} disabled={!canEdit}/></label>
          <label>Address<input name="addressLine1" defaultValue={settings.addressLine1??''} disabled={!canEdit}/></label>
          <label>Address line 2<input name="addressLine2" defaultValue={settings.addressLine2??''} disabled={!canEdit}/></label>
          <label>City<input name="city" defaultValue={settings.city??''} disabled={!canEdit}/></label>
          <label>State / region<input name="region" defaultValue={settings.region??''} disabled={!canEdit}/></label>
          <label>Postal code<input name="postalCode" defaultValue={settings.postalCode??''} disabled={!canEdit}/></label>
        </div>
      </section>

      <section className="card">
        <h2>Booking</h2>
        <div className="formGrid">
          <label>Booking slug<input name="bookingSlug" defaultValue={settings.bookingSlug??''} disabled={!canEdit}/></label>
          <label>Slot duration (minutes)<input name="slotDurationMinutes" type="number" min="15" defaultValue={settings.slotDurationMinutes} disabled={!canEdit}/></label>
          <label>Minimum lead time (hours)<input name="minLeadTimeHours" type="number" min="0" defaultValue={settings.minLeadTimeHours} disabled={!canEdit}/></label>
          <label>Maximum advance (days)<input name="maxAdvanceDays" type="number" min="1" defaultValue={settings.maxAdvanceDays} disabled={!canEdit}/></label>
          <label>Opening time<input name="openingTime" type="time" defaultValue={settings.openingTime??''} disabled={!canEdit}/></label>
          <label>Closing time<input name="closingTime" type="time" defaultValue={settings.closingTime??''} disabled={!canEdit}/></label>
          <label className="checkRow"><input name="bookingEnabled" type="checkbox" defaultChecked={settings.bookingEnabled} disabled={!canEdit}/> Online booking enabled</label>
          <label className="checkRow"><input name="requireApproval" type="checkbox" defaultChecked={settings.requireApproval} disabled={!canEdit}/> Require appointment approval</label>
          <label className="checkRow"><input name="allowCancellation" type="checkbox" defaultChecked={settings.allowCancellation} disabled={!canEdit}/> Allow cancellation</label>
          <label>Cancellation window (hours)<input name="cancellationWindowHours" type="number" min="0" defaultValue={settings.cancellationWindowHours} disabled={!canEdit}/></label>
          <label className="checkRow"><input name="allowRescheduling" type="checkbox" defaultChecked={settings.allowRescheduling} disabled={!canEdit}/> Allow rescheduling</label>
          <label>Reschedule window (hours)<input name="rescheduleWindowHours" type="number" min="0" defaultValue={settings.rescheduleWindowHours} disabled={!canEdit}/></label>
        </div>
      </section>

      <section className="card">
        <h2>Pricing & terms</h2>
        <div className="formGrid">
          <label>Tax rate (%)<input name="taxRate" inputMode="decimal" defaultValue={settings.taxRate} disabled={!canEdit}/></label>
          <label>Payment provider<select name="paymentProvider" defaultValue={settings.paymentProvider??''} disabled={!canEdit}><option value="">None</option><option value="stripe">Stripe</option></select></label>
          <label className="checkRow"><input name="requireTermsAcceptance" type="checkbox" defaultChecked={settings.requireTermsAcceptance} disabled={!canEdit}/> Require terms acceptance</label>
          <label className="span2">Terms & conditions<textarea name="termsAndConditions" rows={6} defaultValue={settings.termsAndConditions??''} disabled={!canEdit}/></label>
        </div>
      </section>

      {canEdit?<div className="formActions"><button className="primaryInline" type="submit">Save settings</button></div>:null}
    </form>
  </main>;
}
