import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const resultSchema = z.object({
  item_name: z.string().trim().min(1).max(250),
  item_category: z.string().trim().max(120).nullable().optional(),
  status: z.enum(["pass", "fail", "warning", "not_applicable", "not_checked"]),
  notes: z.string().max(5000).optional().default(""),
  sort_order: z.number().int().default(0),
});

const inspectionSchema = z.object({
  workspace_id: z.string().uuid(),
  appointment_id: z.string().uuid(),
  vehicle_id: z.string().uuid(),
  service_id: z.string().uuid().nullable().optional(),
  template_id: z.string().uuid(),
  template_name: z.string().trim().min(1).max(250),
  inspector_name: z.string().trim().max(250).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  results: z.array(resultSchema).max(500),
});

export async function POST(request: Request) {
  try {
    const body = inspectionSchema.parse(await request.json());
    const { supabase, user } = await requireWorkspaceMember(
      body.workspace_id,
      ["owner", "admin", "manager", "service_advisor", "technician", "dispatcher"],
      request,
    );
    const db = supabase as any;

    const [{ data: appointment, error: appointmentError }, { data: vehicle, error: vehicleError }] =
      await Promise.all([
        db
          .from("appointments")
          .select("id,workspace_id,vehicle_id")
          .eq("workspace_id", body.workspace_id)
          .eq("id", body.appointment_id)
          .maybeSingle(),
        db
          .from("vehicles")
          .select("id,workspace_id")
          .eq("workspace_id", body.workspace_id)
          .eq("id", body.vehicle_id)
          .maybeSingle(),
      ]);

    if (appointmentError) throw appointmentError;
    if (vehicleError) throw vehicleError;
    if (!appointment) {
      return json({ error: { code: "invalid_appointment", message: "Appointment was not found in this workspace." } }, { status: 404 });
    }
    if (!vehicle) {
      return json({ error: { code: "invalid_vehicle", message: "Vehicle was not found in this workspace." } }, { status: 404 });
    }
    if (appointment.vehicle_id && appointment.vehicle_id !== body.vehicle_id) {
      return json({ error: { code: "vehicle_mismatch", message: "This inspection vehicle does not match the appointment vehicle." } }, { status: 409 });
    }

    const { data: existing, error: existingError } = await db
      .from("service_inspections")
      .select("id,status")
      .eq("workspace_id", body.workspace_id)
      .eq("appointment_id", body.appointment_id)
      .eq("template_id", body.template_id)
      .eq("status", "completed")
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) {
      return json({ data: { id: existing.id, already_completed: true } });
    }

    const { data: inspection, error: inspectionError } = await db
      .from("service_inspections")
      .insert({
        workspace_id: body.workspace_id,
        user_id: user.id,
        service_id: body.service_id ?? null,
        vehicle_id: body.vehicle_id,
        appointment_id: body.appointment_id,
        template_id: body.template_id,
        template_name: body.template_name,
        inspector_name: body.inspector_name ?? null,
        notes: body.notes ?? null,
        status: "completed",
      })
      .select("id,status")
      .single();

    if (inspectionError) throw inspectionError;

    if (body.results.length > 0) {
      const rows = body.results.map((result) => ({
        workspace_id: body.workspace_id,
        inspection_id: inspection.id,
        item_name: result.item_name,
        item_category: result.item_category ?? null,
        status: result.status,
        notes: result.notes || null,
        sort_order: result.sort_order,
      }));

      const { error: resultsError } = await db.from("inspection_results").insert(rows);
      if (resultsError) {
        await db
          .from("service_inspections")
          .delete()
          .eq("workspace_id", body.workspace_id)
          .eq("id", inspection.id);
        throw resultsError;
      }
    }

    return json({ data: { id: inspection.id, already_completed: false } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
