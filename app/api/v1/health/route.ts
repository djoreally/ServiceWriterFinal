import { json } from "@/server/api";

export async function GET() {
  return json({ ok: true, service: "servicewriter-api", version: "v1", timestamp: new Date().toISOString() });
}
