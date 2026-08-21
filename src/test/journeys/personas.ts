import type { Session, User } from "@supabase/supabase-js";

export interface PersonaPreset {
  session: Session | null;
  user: User | null;
  role: "owner" | "admin" | "manager" | "dispatcher" | "technician" | "guest" | "super_admin";
  teamId: string | null;
  businessSlug: string;
}

function makeUser(id: string, email: string, role: string): User {
  return {
    id,
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: new Date().toISOString(),
    phone: "",
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { full_name: `${role.toUpperCase()} User` },
    identities: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function makeSession(user: User): Session {
  return {
    access_token: `test-jwt-${user.id}`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `test-refresh-${user.id}`,
    user,
  };
}

// Uses super admin email so SubscriptionContext grants full feature access without edge function delays
const OWNER_USER = makeUser("00000000-0000-0000-0000-000000000001", "djoreally@gmail.com", "owner");
const DISPATCHER_USER = makeUser("00000000-0000-0000-0000-000000000002", "dispatcher@apexautocare.com", "dispatcher");
const TECH_USER = makeUser("00000000-0000-0000-0000-000000000003", "dave.tech@apexautocare.com", "technician");
const SUPER_ADMIN_USER = makeUser("00000000-0000-0000-0000-000000000099", "admin@servicewriter.xyz", "super_admin");

export const personas = {
  asGuest: (): PersonaPreset => ({
    session: null,
    user: null,
    role: "guest",
    teamId: null,
    businessSlug: "apex-auto",
  }),

  asOwner: (): PersonaPreset => ({
    session: makeSession(OWNER_USER),
    user: OWNER_USER,
    role: "admin",
    teamId: "team-apex-001",
    businessSlug: "apex-auto",
  }),

  asDispatcher: (): PersonaPreset => ({
    session: makeSession(DISPATCHER_USER),
    user: DISPATCHER_USER,
    role: "dispatcher",
    teamId: "team-apex-001",
    businessSlug: "apex-auto",
  }),

  asTechnician: (): PersonaPreset => ({
    session: makeSession(TECH_USER),
    user: TECH_USER,
    role: "technician",
    teamId: "team-apex-001",
    businessSlug: "apex-auto",
  }),

  asSuperAdmin: (): PersonaPreset => ({
    session: makeSession(SUPER_ADMIN_USER),
    user: SUPER_ADMIN_USER,
    role: "admin",
    teamId: "team-apex-001",
    businessSlug: "apex-auto",
  }),
};
