/**
 * ScreenMyCalls connection — shared types for the Agent integrations
 * panel. ScreenMyCalls is bundled free with ServiceWriter: connecting
 * here signs the shop up, provisions their number, and (optionally)
 * registers their own 10DLC brand/campaign for custom texting.
 */

export interface ScreenMyCallsLiveStatus {
  organization: { id: string; name: string; signupSource: string };
  bundle: { plan: string; planStatus: string; minutesUsed: number; minutesIncluded: number | null };
  numbers: Array<{ phoneNumber: string; status: string; selected: boolean }>;
  selectedNumber: string | null;
  mirrorEnabled: boolean;
  lastMirror: { status: string; at: string; error: string | null } | null;
  tenDlc: TenDlcState | null;
}

export interface ScreenMyCallsStatus {
  connected: boolean;
  organizationId?: string;
  organizationName?: string | null;
  number?: string | null;
  connectedAt?: string | null;
  mirrorEnabled?: boolean;
  live?: ScreenMyCallsLiveStatus;
}

export interface TenDlcState {
  status: string; // not_started | brand_pending | brand_verified | campaign_pending | active | failed
  brandId: string | null;
  campaignId: string | null;
  brandStatus: string | null;
  campaignStatus: string | null;
  failureReason: string | null;
  updatedAt: string | null;
}

export interface NumberSearchResult {
  phoneNumber: string;
  locality: string | null;
  region: string | null;
  features: string[];
}

export interface TenDlcRegistrationInput {
  legal_business_name: string;
  ein: string;
  business_type: string;
  industry: string;
  website?: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  contact_email: string;
  contact_phone: string;
  use_case: string;
  message_samples: string[];
}
