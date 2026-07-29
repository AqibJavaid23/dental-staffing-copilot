import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const first = searchParams.get("first") || "";
  const last = searchParams.get("last") || "";
  const state = searchParams.get("state") || "";
  const city = searchParams.get("city") || "";
  const npi = searchParams.get("npi") || "";

  let url: string;
  if (npi) {
    url = `https://npiregistry.cms.hhs.gov/api/?version=2.1&number=${encodeURIComponent(npi)}&limit=10`;
  } else if (first || last || city) {
    url = `https://npiregistry.cms.hhs.gov/api/?version=2.1&first_name=${encodeURIComponent(first)}&last_name=${encodeURIComponent(last)}&state=${encodeURIComponent(state)}&city=${encodeURIComponent(city)}&limit=20`;
  } else {
    return NextResponse.json({ error: "Provide an NPI number or a name/city" }, { status: 400 });
  }

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