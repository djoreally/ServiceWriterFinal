export type OperationalJobSource = "appointment" | "fleet_work_order";

export function mapOperationalSourceToJobSource(source: string | null | undefined): OperationalJobSource | null {
  if (!source) return null;
  if (source === "appointment") return "appointment";
  if (source === "fleet_work_order") return "fleet_work_order";
  return null;
}
