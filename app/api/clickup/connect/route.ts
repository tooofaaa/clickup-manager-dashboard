import { NextResponse } from "next/server";
import { getTeams } from "@/lib/clickup-client";

export async function GET() {
  try {
    const teams = await getTeams();
    return NextResponse.json({ ok: true, teams });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
