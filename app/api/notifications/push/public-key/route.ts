import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (!publicKey) {
    return NextResponse.json({ error: "push_not_configured" }, { status: 503 });
  }
  return NextResponse.json({ publicKey }, {
    headers: {
      "cache-control": "public, max-age=300, s-maxage=300",
    },
  });
}
