import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const vehicleUpdateSchema = z.object({
  workspace_id: z.string().uuid(),
  customer_id: z.string().uuid().nullable().optional(),
  vin: z.string().trim().max(32).nullable().optional(),
  year: z.number().int().min(1886).max(2200).nullable().optional(),
  make: z.string().trim().max(80).nullable().optional(),
  model: z.string().trim().max(120).nullable().optional(),
  trim: z.string().trim().max(120).nullable().optional(),
  license_plate: z.string().trim().max(30).nullable().optional(),
  plate_state: z.string().trim().max(20).nullable().optional(),
  plate_region: z.string().trim().max(20).nullable().optional(),
  color: z.string().trim().max(50).nullable().optional(),
  mileage: z.number().int().min(0).nullable().optional(),
  mileage_unit: z.enum(["mi", "km"]).optional(),
  odometer_measure: z.string().trim().max(20).nullable().optional(),
  engine: z.string().trim().max(120).nullable().optional(),
  oil_type: z.string().trim().max(80).nullable().optional(),
  oil_capacity: z.string().trim().max(40).nullable().optional(),
  oil_filter: z.string().trim().max(100).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
}).refine((body) => Object.keys(body).some((key) => key !== "workspace_id"), {
  message: "At least one vehicle field is required",
});

const writeRoles = ["owner", "admin", "manager", "service_advisor", "receptionist", "technician"] as const;

function normalizeVin(value: string | null | undefined): string {
  return String(value ?? "").toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
}

function validVin(value: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(value);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const id = z.string().uuid().parse((await context.params).id);
    const { supabase } = await requireWorkspaceMember(workspaceId, undefined, request);
    const { data, error } = await supabase
      .from("vehicles")
      .select("*,customers(id,first_name,last_name,email,phone),vehicle_service_specs(engine,oil_type,oil_capacity,oil_filter,metadata)")
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .single();
    if (error) throw error;
    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const body = vehicleUpdateSchema.parse(await request.json());
    const id = z.string().uuid().parse((await context.params).id);
    const { supabase } = await requireWorkspaceMember(body.workspace_id, [...writeRoles], request);

    if (Object.prototype.hasOwnProperty.call(body, "customer_id") && body.customer_id) {
      const { data: customer, error: customerError } = await supabase
        .from("customers")
        .select("id")
        .eq("workspace_id", body.workspace_id)
        .eq("id", body.customer_id)
        .neq("status", "archived")
        .maybeSingle();
      if (customerError) throw customerError;
      if (!customer) throw new Error("Customer does not belong to this workspace.");
    }

    const { workspace_id, engine, oil_type, oil_capacity, oil_filter, odometer_measure, plate_state, ...vehicleInput } = body;
    const patch: Record<string, unknown> = { ...vehicleInput };

    if (Object.prototype.hasOwnProperty.call(body, "plate_state") && !Object.prototype.hasOwnProperty.call(body, "plate_region")) {
      patch.plate_region = plate_state ?? null;
    }

    const needsCurrent = Object.prototype.hasOwnProperty.call(body, "odometer_measure")
      || Object.prototype.hasOwnProperty.call(body, "vin");
    let currentMetadata: Record<string, unknown> = {};
    let previousVin = "";
    if (needsCurrent) {
      const { data: current, error: currentError } = await supabase
        .from("vehicles")
        .select("vin,metadata")
        .eq("workspace_id", workspace_id)
        .eq("id", id)
        .maybeSingle();
      if (currentError) throw currentError;
      if (!current) throw new Error("Vehicle does not belong to this workspace.");
      previousVin = normalizeVin(current.vin);
      currentMetadata = current.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
        ? current.metadata as Record<string, unknown>
        : {};
    }

    if (Object.prototype.hasOwnProperty.call(body, "odometer_measure")) {
      patch.metadata = { ...currentMetadata, odometer_measure: odometer_measure ?? null };
    }

    const nextVin = Object.prototype.hasOwnProperty.call(body, "vin") ? normalizeVin(body.vin) : previousVin;
    const vinChanged = Object.prototype.hasOwnProperty.call(body, "vin") && nextVin !== previousVin;
    let decoded: {
      year?: number | null;
      make?: string | null;
      model?: string | null;
      trim?: string | null;
      engine?: string | null;
      oilSpecs?: { oilType?: string | null; oilCapacity?: string | null; oilFilter?: string | null } | null;
    } | null = null;
    let vinDecodeStatus: "not_changed" | "decoded" | "failed" | "invalid" = "not_changed";

    if (vinChanged) {
      if (validVin(nextVin)) {
        const result = await supabase.functions.invoke("vin-decode", { body: { vin: nextVin } });
        if (!result.error && result.data) {
          decoded = result.data as typeof decoded;
          vinDecodeStatus = "decoded";
          patch.vin = nextVin;
          if (decoded?.year != null) patch.year = decoded.year;
          if (decoded?.make) patch.make = decoded.make;
          if (decoded?.model) patch.model = decoded.model;
          if (decoded?.trim) patch.trim = decoded.trim;
        } else {
          vinDecodeStatus = "failed";
        }
      } else if (nextVin) {
        vinDecodeStatus = "invalid";
      }

      patch.metadata = {
        ...currentMetadata,
        ...(patch.metadata && typeof patch.metadata === "object" ? patch.metadata as Record<string, unknown> : {}),
        vin_decode_status: vinDecodeStatus,
        vin_decode_checked_at: new Date().toISOString(),
      };
    }

    let vehicle: unknown;
    if (Object.keys(patch).length > 0) {
      const { data, error } = await supabase
        .from("vehicles")
        .update(patch as never)
        .eq("id", id)
        .eq("workspace_id", workspace_id)
        .select()
        .single();
      if (error) throw error;
      vehicle = data;
    } else {
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .eq("id", id)
        .eq("workspace_id", workspace_id)
        .single();
      if (error) throw error;
      vehicle = data;
    }

    if (vinChanged || [engine, oil_type, oil_capacity, oil_filter].some((value) => value !== undefined)) {
      const { data: currentSpecs, error: currentSpecsError } = await supabase
        .from("vehicle_service_specs")
        .select("engine,oil_type,oil_capacity,oil_filter,metadata")
        .eq("workspace_id", workspace_id)
        .eq("vehicle_id", id)
        .maybeSingle();
      if (currentSpecsError) throw currentSpecsError;

      const decodedOil = decoded?.oilSpecs ?? null;
      const { error: specsError } = await supabase.from("vehicle_service_specs").upsert({
        workspace_id,
        vehicle_id: id,
        engine: engine !== undefined ? engine : vinChanged ? decoded?.engine ?? null : currentSpecs?.engine ?? null,
        oil_type: oil_type !== undefined ? oil_type : vinChanged ? decodedOil?.oilType ?? null : currentSpecs?.oil_type ?? null,
        oil_capacity: oil_capacity !== undefined ? oil_capacity : vinChanged ? decodedOil?.oilCapacity ?? null : currentSpecs?.oil_capacity ?? null,
        oil_filter: oil_filter !== undefined ? oil_filter : vinChanged ? decodedOil?.oilFilter ?? null : currentSpecs?.oil_filter ?? null,
        source: vinChanged ? (vinDecodeStatus === "decoded" ? "vin_decode" : "vin_changed_pending_decode") : "service_writer",
        metadata: {
          ...(currentSpecs?.metadata ?? {}),
          ...(vinChanged ? {
            vin: nextVin || null,
            vin_decode_status: vinDecodeStatus,
            vin_decode_checked_at: new Date().toISOString(),
          } : {}),
        },
      } as never, { onConflict: "workspace_id,vehicle_id" });
      if (specsError) throw specsError;
    }

    return json({ data: vehicle });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const id = z.string().uuid().parse((await context.params).id);
    const { supabase, user } = await requireWorkspaceMember(workspaceId, [...writeRoles], request);
    const { data: current, error: currentError } = await supabase
      .from("vehicles")
      .select("id,metadata")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) throw new Error("Vehicle does not belong to this workspace.");
    const metadata = current.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
      ? current.metadata as Record<string, unknown>
      : {};
    const archivedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("vehicles")
      .update({ metadata: { ...metadata, archived_at: archivedAt, archived_by: user.id } } as never)
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .select("id,metadata")
      .single();
    if (error) throw error;
    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
