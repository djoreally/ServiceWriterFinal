import { supabase } from "@/integrations/supabase/client";

export interface OAuthClientInfo {
  name?: string | null;
  client_name?: string | null;
  logo_uri?: string | null;
}

export interface AuthorizationDetails {
  client?: OAuthClientInfo | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
  scope?: string | null;
}

type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
};

function oauth(): OAuthNamespace {
  return (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;
}

export function getOAuthAuthorizationDetails(id: string) {
  return oauth().getAuthorizationDetails(id);
}

export function approveOAuthAuthorization(id: string) {
  return oauth().approveAuthorization(id);
}

export function denyOAuthAuthorization(id: string) {
  return oauth().denyAuthorization(id);
}

export function getOAuthSession() {
  return supabase.auth.getSession();
}
