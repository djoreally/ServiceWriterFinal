import {
  buildBusinessProfileFixture,
  buildServiceCatalogFixture,
  buildAppointmentFixture,
  buildWorkOrderFixture,
  buildFleetJobFixture,
  buildTechnicianFixture,
  buildSubscriptionFixture,
  buildPaymentRecordFixture,
  buildInventoryItemFixture,
} from "./fixtures";
import type { PersonaPreset } from "./personas";
import { personas } from "./personas";
import { useStartupRoutingStore } from "@/stores/startupRoutingStore";

export interface RecordedCall {
  type: "from" | "rpc" | "functions.invoke" | "auth";
  target: string;
  method?: string;
  args?: any;
  timestamp: number;
}

export class FakeBackend {
  public recordedCalls: RecordedCall[] = [];
  public tables: Record<string, any[]> = {};
  public rpcHandlers: Record<string, (args: any) => Promise<{ data: any; error: any }> | { data: any; error: any }> = {};
  public edgeHandlers: Record<string, (options: any) => Promise<{ data: any; error: any }> | { data: any; error: any }> = {};
  public currentPersona: PersonaPreset;
  private authStateListeners: Array<(event: string, session: any) => void> = [];

  constructor(initialPersona: PersonaPreset = personas.asOwner()) {
    this.currentPersona = initialPersona;
    this.resetTables();
    this.setupDefaultRpcHandlers();
    this.setupDefaultEdgeHandlers();
    useStartupRoutingStore.setState({ hasHydrated: true, intendedPath: null });
  }

  public resetCalls() {
    this.recordedCalls = [];
  }

  public resetTables() {
    const biz = buildBusinessProfileFixture();
    const services = buildServiceCatalogFixture();
    const appt = buildAppointmentFixture();
    const wo = buildWorkOrderFixture();
    const fleetJob = buildFleetJobFixture();
    const tech = buildTechnicianFixture();
    const sub = buildSubscriptionFixture();
    const pay = buildPaymentRecordFixture();
    const inv = buildInventoryItemFixture();

    this.tables = {
      business_profiles: [biz],
      workspace_members: [
        { workspace_id: "00000000-0000-4000-8000-000000000001", user_id: "00000000-0000-0000-0000-000000000001", is_active: true, role: "owner" },
        { workspace_id: "00000000-0000-4000-8000-000000000001", user_id: "00000000-0000-0000-0000-000000000002", is_active: true, role: "dispatcher" },
        { workspace_id: "00000000-0000-4000-8000-000000000001", user_id: "00000000-0000-0000-0000-000000000003", is_active: true, role: "technician" },
      ],
      service_catalog: [...services],
      appointments: [appt],
      fleet_work_orders: [wo],
      fleet_jobs: [fleetJob],
      technicians: [tech],
      subscriptions: [sub],
      payment_records: [pay],
      inventory_items: [inv],
      vans: [
        {
          id: "van-001",
          user_id: "00000000-0000-0000-0000-000000000001",
          name: "Mobile Unit 1 - Ford Transit",
          assigned_technician_id: "tech-001",
          is_active: true,
          created_at: new Date().toISOString(),
        },
      ],
      time_clock_entries: [
        {
          id: "shift-001",
          user_id: "00000000-0000-0000-0000-000000000003",
          clock_in: new Date().toISOString(),
          status: "active",
          created_at: new Date().toISOString(),
        },
      ],
      technician_notification_preferences: [
        {
          user_id: "00000000-0000-0000-0000-000000000003",
          push_notifications_enabled: true,
          dispatch_push_enabled: true,
          customer_sms_enabled: true,
          customer_email_enabled: true,
          offline_cache_enabled: true,
        },
      ],
      team_members: [
        {
          id: "tm-owner",
          user_id: "00000000-0000-0000-0000-000000000001",
          team_id: "team-apex-001",
          role: "admin",
          created_at: new Date().toISOString(),
        },
        {
          id: "tm-dispatcher",
          user_id: "00000000-0000-0000-0000-000000000002",
          team_id: "team-apex-001",
          role: "dispatcher",
          created_at: new Date().toISOString(),
        },
        {
          id: "tm-tech",
          user_id: "00000000-0000-0000-0000-000000000003",
          team_id: "team-apex-001",
          role: "technician",
          created_at: new Date().toISOString(),
        },
      ],
      fleet_clients: [
        {
          id: "fleet-client-101",
          user_id: "00000000-0000-0000-0000-000000000001",
          company_name: "Metro Logistics LLC",
          billing_email: "billing@metrologistics.com",
          contract_discount_percent: 10,
          created_at: new Date().toISOString(),
        },
      ],
      fleet_vehicles: [
        {
          id: "veh-fleet-101",
          user_id: "00000000-0000-0000-0000-000000000001",
          fleet_client_id: "fleet-client-101",
          vin: "1FTFW1ED4MFC12345",
          year: 2021,
          make: "Ford",
          model: "F-150",
          license_plate: "PA-ABC123",
          created_at: new Date().toISOString(),
        },
      ],
      customers: [
        {
          id: "cust-001",
          user_id: "00000000-0000-0000-0000-000000000001",
          first_name: "Jane",
          last_name: "Doe",
          email: "jane.doe@example.com",
          phone: "+12155550144",
          created_at: new Date().toISOString(),
        },
      ],
      analytics_events: [],
      notifications: [],
      subscription_plans: [],
      marketplace_listings: [],
      marketplace_reviews: [],
    };
  }

  public setPersona(persona: PersonaPreset) {
    this.currentPersona = persona;
    this.recordedCalls.push({
      type: "auth",
      target: "setPersona",
      args: { role: persona.role, user: persona.user?.email },
      timestamp: Date.now(),
    });
    const event = persona.session ? "SIGNED_IN" : "SIGNED_OUT";
    this.authStateListeners.forEach((listener) => {
      listener(event, persona.session);
    });
  }

  private setupDefaultRpcHandlers() {
    this.rpcHandlers = {
      book_appointment_safe: (args) => {
        const id = `appt-${Date.now()}`;
        const newAppt = {
          id,
          user_id: args.p_business_user_id,
          title: args.p_title,
          guest_name: args.p_guest_name,
          guest_email: args.p_guest_email,
          guest_phone: args.p_guest_phone,
          scheduled_date: args.p_scheduled_date,
          scheduled_time: args.p_scheduled_time,
          duration_minutes: args.p_duration_minutes,
          status: args.p_status || "confirmed",
          estimated_cost: args.p_estimated_cost,
          tax_amount: args.p_tax_amount,
          service_catalog_id: args.p_service_catalog_id,
          created_at: new Date().toISOString(),
        };
        this.tables.appointments.push(newAppt);
        return { data: id, error: null };
      },
      get_business_profile_by_slug: (args) => {
        const profile = this.tables.business_profiles.find(
          (b) => b.business_slug === args.p_slug
        );
        return { data: profile ? [profile] : [], error: null };
      },
      get_directory_provider_profile: (args: any) => {
        const slug = args?.booking_slug_param || args?.slug || args?.p_slug || args?.business_slug;
        const profile = this.tables.business_profiles.find(
          (b) => b.business_slug === slug
        ) ?? (slug === "apex-auto" ? this.tables.business_profiles[0] : undefined);
        if (!profile) return { data: [], error: null };
        return {
          data: [
            {
              user_id: profile.user_id,
              business_name: profile.business_name,
              booking_slug: profile.business_slug,
              logo_url: profile.logo_url || null,
              phone: profile.phone || null,
              service_address: profile.address || null,
              city: "Philadelphia",
              state: "PA",
              postal_code: "19106",
              google_review_url: null,
              yelp_review_url: null,
            },
          ],
          error: null,
        };
      },
      get_public_booking_profile_v2: (args: any) => {
        const slug = args?.booking_slug_param || args?.slug || args?.p_slug || args?.business_slug;
        const profile = this.tables.business_profiles.find(
          (b) => b.business_slug === slug
        ) ?? (slug === "apex-auto" ? this.tables.business_profiles[0] : undefined);
        if (!profile) return { data: [], error: null };
        return {
          data: [
            {
              user_id: profile.user_id,
              business_name: profile.business_name,
              logo_url: profile.logo_url || null,
              phone: profile.phone || null,
              email: profile.email || null,
              opening_time: "08:00",
              closing_time: "18:00",
              working_days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"],
              currency: "USD",
              stripe_charges_enabled: true,
              service_radius_miles: 25,
              service_address: "100 Main St, Philadelphia, PA 19106",
              service_coordinates: { lat: 39.9526, lng: -75.1652 },
              buffer_time_before: 0,
              buffer_time_after: 0,
              min_lead_time_hours: 2,
              max_advance_days: 30,
              slot_duration_minutes: 30,
            },
          ],
          error: null,
        };
      },
      get_public_booking_settings: (_args: any) => {
        return {
          data: [
            {
              waste_oil_fee_enabled: false,
              waste_oil_fee: 0,
              shop_fee_enabled: false,
              shop_fee_type: "fixed",
              shop_fee_value: 0,
              shop_fee_description: "Shop Supplies",
              surcharge_enabled: false,
              surcharge_type: "percentage",
              surcharge_value: 0,
              surcharge_description: "Processing Fee",
              payment_provider: "stripe",
              oil_price_per_quart: 9.99,
              weather_guard_enabled: false,
              weather_guard_settings: null,
              day_hours: null,
              service_verticals: ["oil_change", "brakes"],
            },
          ],
          error: null,
        };
      },
      get_public_service_catalog_v2: (_args: any) => {
        return { data: this.tables.service_catalog.filter((s) => s.is_active !== false), error: null };
      },
      get_public_service_catalog: (_args: any) => {
        return { data: this.tables.service_catalog.filter((s) => s.is_active !== false), error: null };
      },
      get_public_service_packages: (_args: any) => {
        return { data: [], error: null };
      },
      get_public_blocked_dates: (_args: any) => {
        return { data: [], error: null };
      },
      get_booked_slots: (_args: any) => {
        return { data: [], error: null };
      },
      get_technician_app_context_v1: () => {
        const persona = this.currentPersona;
        return {
          data: {
            user_id: persona.user?.id || "00000000-0000-0000-0000-000000000003",
            workspace_user_id: "00000000-0000-0000-0000-000000000001",
            technician_id: "tech-001",
            technician_name: "Dave Miller",
            role: persona.role === "technician" ? "technician" : "admin",
            is_admin_preview: persona.role !== "technician",
            access_state: persona.role === "technician" ? "linked" : "admin_preview",
            presence_state: "available",
            field_status: "available",
            shift_id: "shift-001",
            shift_status: "active",
            clock_in: new Date().toISOString(),
            van_id: "van-001",
            van_name: "Mobile Unit 1 - Ford Transit",
            push_notifications_enabled: true,
            data_fresh_at: new Date().toISOString(),
          },
          error: null,
        };
      },
      get_technician_session_v2: () => {
        return {
          data: {
            access_state: "linked",
            workspace_user_id: "00000000-0000-0000-0000-000000000001",
            technician_id: "tech-001",
            shift: { shift_id: "shift-001", clock_in: new Date().toISOString(), break_start: null, break_end: null, status: "active" },
            is_on_shift: true,
            is_on_break: false,
            jobs: [
              {
                id: "appt-001",
                job_source: "appointment",
                is_fleet: false,
                title: "Full Synthetic Oil Change",
                scheduled_date: new Date().toISOString().split("T")[0],
                scheduled_time: "10:00",
                estimated_duration_minutes: 45,
                status: "confirmed",
                dispatch_status: "dispatched",
                stage: "scheduled",
                job_priority: "normal",
                customer_name: "Jane Doe",
                customer_phone: "+12155550144",
                location_address: "500 Market St, Philadelphia, PA 19106",
                location_lat: 39.9526,
                location_lng: -75.1652,
                notes: "Customer prefers morning service.",
                vehicle_year: 2020,
                vehicle_make: "Honda",
                vehicle_model: "Civic",
                service_name: "Full Synthetic Oil Change",
                updated_at: new Date().toISOString(),
              },
            ],
            current_job: null,
            next_job: null,
            data_fresh_at: new Date().toISOString(),
          },
          error: null,
        };
      },
      get_workforce_identity_v1: () => {
        const role = this.currentPersona.role;
        if (role === "guest" || !this.currentPersona.user) {
          return { data: [], error: null };
        }
        const landingPath =
          role === "technician"
            ? "/tech-app"
            : role === "dispatcher"
            ? "/dispatch"
            : "/dashboard";
        return {
          data: [
            {
              workspace_user_id: this.currentPersona.user.id,
              workspace_name: "Apex Mobile Auto Care",
              role,
              landing_path: landingPath,
              is_default: true,
            },
          ],
          error: null,
        };
      },
      get_team_role: (_args) => {
        return { data: this.currentPersona.role, error: null };
      },
      check_rate_limit: (_args) => {
        return { data: { allowed: true, remaining: 10 }, error: null };
      },
    };
  }

  private setupDefaultEdgeHandlers() {
    this.edgeHandlers = {
      "gate-app-access": () => ({
        data: { allowed: true, reason: "ok", redirectTo: null },
        error: null,
      }),
      "calculate-tax": () => ({
        data: { success: true, tax_amount: 540, total: 9539, tax_breakdown: [] },
        error: null,
      }),
      "location-service": (options: any) => {
        const body = options?.body ?? {};
        switch (body.action) {
          case "get_location_quality_queue":
            return { data: { jobs: [] }, error: null };
          case "resolve_location":
            return { data: { results: [], persistenceMode: body.persistenceMode ?? "temporary" }, error: null };
          case "get_dispatch_candidates":
            return { data: { candidates: [] }, error: null };
          default:
            return { data: { success: true }, error: null };
        }
      },
      "check-platform-subscription": () => ({
        data: {
          subscribed: true,
          plan: "growth",
          plan_display_name: "Growth Plan",
          status: "active",
          features: {
            max_appointments_per_month: null,
            max_technician_seats: 10,
            max_customers: null,
            has_public_booking: true,
            has_invoicing_basic: true,
            has_invoicing_full: true,
            has_stripe_payments: true,
            has_dispatch_engine: true,
            has_ai_routing: true,
            has_fleet_os: true,
            has_technician_os: true,
            has_marketing_automation: true,
            has_quickbooks_sync: true,
            has_carfax_integration: true,
            has_pwa_offline: true,
            has_ai_assistant: true,
            tax_compliance_level: "full",
            support_level: "priority_email",
          },
          usage: { appointments_this_month: 5, technician_count: 2, customer_count: 15 },
          limits: { appointments_remaining: null, technicians_remaining: 8, customers_remaining: null },
          current_period_end: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
          cancel_at_period_end: false,
          grace_period_ends_at: null,
          is_trialing: false,
          trial_ends_at: null,
          trial_days_remaining: null,
        },
        error: null,
      }),
    };
  }

  public removeChannel(_channel: any) {}

  // Builder for query chain
  public from(table: string) {
    this.recordedCalls.push({
      type: "from",
      target: table,
      method: "from",
      timestamp: Date.now(),
    });

    const rows = this.tables[table] || [];
    let currentData = [...rows];
    let isSingle = false;
    let isMaybeSingle = false;

    const chain = {
      select: (fields?: string) => {
        this.recordedCalls.push({ type: "from", target: table, method: "select", args: fields, timestamp: Date.now() });
        return chain;
      },
      insert: (data: any) => {
        this.recordedCalls.push({ type: "from", target: table, method: "insert", args: data, timestamp: Date.now() });
        const items = Array.isArray(data) ? data : [data];
        const inserted = items.map((item, idx) => ({
          id: item.id || `gen-${table}-${Date.now()}-${idx}`,
          created_at: new Date().toISOString(),
          ...item,
        }));
        if (!this.tables[table]) this.tables[table] = [];
        this.tables[table].push(...inserted);
        currentData = inserted;
        return chain;
      },
      update: (data: any) => {
        this.recordedCalls.push({ type: "from", target: table, method: "update", args: data, timestamp: Date.now() });
        currentData = currentData.map((item) => ({ ...item, ...data }));
        return chain;
      },
      upsert: (data: any) => {
        this.recordedCalls.push({ type: "from", target: table, method: "upsert", args: data, timestamp: Date.now() });
        return chain;
      },
      delete: () => {
        this.recordedCalls.push({ type: "from", target: table, method: "delete", timestamp: Date.now() });
        return chain;
      },
      eq: (column: string, value: any) => {
        this.recordedCalls.push({ type: "from", target: table, method: "eq", args: { column, value }, timestamp: Date.now() });
        currentData = currentData.filter((r) => r[column] === value);
        return chain;
      },
      neq: (column: string, value: any) => {
        this.recordedCalls.push({ type: "from", target: table, method: "neq", args: { column, value }, timestamp: Date.now() });
        currentData = currentData.filter((r) => r[column] !== value);
        return chain;
      },
      is: (column: string, value: any) => {
        this.recordedCalls.push({ type: "from", target: table, method: "is", args: { column, value }, timestamp: Date.now() });
        currentData = currentData.filter((r) => r[column] === value);
        return chain;
      },
      gte: (column: string, value: any) => {
        this.recordedCalls.push({ type: "from", target: table, method: "gte", args: { column, value }, timestamp: Date.now() });
        currentData = currentData.filter((r) => r[column] >= value);
        return chain;
      },
      gt: (column: string, value: any) => {
        this.recordedCalls.push({ type: "from", target: table, method: "gt", args: { column, value }, timestamp: Date.now() });
        currentData = currentData.filter((r) => r[column] > value);
        return chain;
      },
      lte: (column: string, value: any) => {
        this.recordedCalls.push({ type: "from", target: table, method: "lte", args: { column, value }, timestamp: Date.now() });
        currentData = currentData.filter((r) => r[column] <= value);
        return chain;
      },
      in: (column: string, values: any[]) => {
        this.recordedCalls.push({ type: "from", target: table, method: "in", args: { column, values }, timestamp: Date.now() });
        currentData = currentData.filter((r) => values.includes(r[column]));
        return chain;
      },
      or: (condition: string) => {
        this.recordedCalls.push({ type: "from", target: table, method: "or", args: condition, timestamp: Date.now() });
        return chain;
      },
      order: (column: string, options?: any) => {
        this.recordedCalls.push({ type: "from", target: table, method: "order", args: { column, options }, timestamp: Date.now() });
        return chain;
      },
      limit: (count: number) => {
        this.recordedCalls.push({ type: "from", target: table, method: "limit", args: count, timestamp: Date.now() });
        currentData = currentData.slice(0, count);
        return chain;
      },
      range: (from: number, to: number) => {
        this.recordedCalls.push({ type: "from", target: table, method: "range", args: { from, to }, timestamp: Date.now() });
        currentData = currentData.slice(from, to + 1);
        return chain;
      },
      single: () => {
        this.recordedCalls.push({ type: "from", target: table, method: "single", timestamp: Date.now() });
        isSingle = true;
        return chain;
      },
      maybeSingle: () => {
        this.recordedCalls.push({ type: "from", target: table, method: "maybeSingle", timestamp: Date.now() });
        isMaybeSingle = true;
        return chain;
      },
      csv: () => {
        this.recordedCalls.push({ type: "from", target: table, method: "csv", timestamp: Date.now() });
        return Promise.resolve({ data: "id,name\n1,test", error: null });
      },
      then: (resolve: any, reject?: any) => {
        let result: any = currentData;
        if (isSingle) {
          result = currentData[0] || null;
          if (!result) {
            return Promise.resolve({ data: null, error: { message: "Row not found", code: "PGRST116" } }).then(resolve, reject);
          }
        } else if (isMaybeSingle) {
          result = currentData[0] || null;
        }
        return Promise.resolve({ data: result, error: null }).then(resolve, reject);
      },
    };

    return chain;
  }

  public async rpc(name: string, args: any = {}) {
    this.recordedCalls.push({
      type: "rpc",
      target: name,
      args,
      timestamp: Date.now(),
    });

    if (this.rpcHandlers[name]) {
      return await this.rpcHandlers[name](args);
    }
    return { data: null, error: null };
  }

  public functions = {
    invoke: async (name: string, options: any = {}) => {
      this.recordedCalls.push({
        type: "functions.invoke",
        target: name,
        args: options,
        timestamp: Date.now(),
      });
      if (this.edgeHandlers[name]) {
        return await this.edgeHandlers[name](options);
      }
      return { data: { success: true }, error: null };
    },
  };

  public auth = {
    getSession: async () => {
      this.recordedCalls.push({ type: "auth", target: "getSession", timestamp: Date.now() });
      return { data: { session: this.currentPersona.session }, error: null };
    },
    getUser: async () => {
      this.recordedCalls.push({ type: "auth", target: "getUser", timestamp: Date.now() });
      return { data: { user: this.currentPersona.user }, error: null };
    },
    onAuthStateChange: (callback: (event: string, session: any) => void) => {
      this.authStateListeners.push(callback);
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              this.authStateListeners = this.authStateListeners.filter((cb) => cb !== callback);
            },
          },
        },
      };
    },
    signInWithPassword: async (credentials: any) => {
      this.recordedCalls.push({ type: "auth", target: "signInWithPassword", args: credentials, timestamp: Date.now() });
      this.setPersona(personas.asOwner());
      return { data: { session: this.currentPersona.session, user: this.currentPersona.user }, error: null };
    },
    signOut: async () => {
      this.recordedCalls.push({ type: "auth", target: "signOut", timestamp: Date.now() });
      this.setPersona(personas.asGuest());
      return { error: null };
    },
    resetPasswordForEmail: async (email: string) => {
      this.recordedCalls.push({ type: "auth", target: "resetPasswordForEmail", args: { email }, timestamp: Date.now() });
      return { data: {}, error: null };
    },
  };

  public channel(name: string) {
    const channelObj = {
      on: (_event: string, _filter: any, _callback?: any) => channelObj,
      subscribe: (_callback?: any) => channelObj,
      unsubscribe: () => {},
    };
    return channelObj;
  }
}

let activeFakeBackend: FakeBackend | null = null;

export function getFakeBackend(): FakeBackend {
  if (!activeFakeBackend) {
    activeFakeBackend = new FakeBackend();
  }
  return activeFakeBackend;
}

export function resetFakeBackend(persona: PersonaPreset = personas.asOwner()): FakeBackend {
  activeFakeBackend = new FakeBackend(persona);
  return activeFakeBackend;
}
