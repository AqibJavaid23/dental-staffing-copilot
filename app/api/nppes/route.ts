import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const first = searchParams.get("first") || "";
  const last = searchParams.get("last") || "";
  const state = searchParams.get("state") || "";

  if (!first || !last) {
    return NextResponse.json({ error: "first and last name required" }, { status: 400 });
  }

  const url = `https://npiregistry.cms.hhs.gov/api/?version=2.1&first_name=${encodeURIComponent(first)}&last_name=${encodeURIComponent(last)}&state=${encodeURIComponent(state)}&limit=10`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: `NPPES API failed (${res.status})` }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "fetch failed" }, { status: 502 });
  }
}