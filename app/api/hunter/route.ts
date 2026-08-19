import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get("domain")?.trim();
  if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });

  const key = process.env.HUNTER_API_KEY;
  if (!key) return NextResponse.json({ error: "Hunter API key not configured" }, { status: 500 });

  try {
    const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${key}&limit=25`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json({ error: data?.errors?.[0]?.details || "Hunter request failed" }, { status: res.status });
    }

    const people = (data?.data?.emails || []).map((e: Record<string, unknown>) => ({
      email: e.value,
      name: [e.first_name, e.last_name].filter(Boolean).join(" "),
      title: e.position || "",
      confidence: e.confidence || 0,
    }));

    // Hunter tells us usage in meta
    const searchesUsed = data?.meta?.params ? undefined : undefined;
    return NextResponse.json({
      people,
      domain,
      // account-level remaining is fetched separately; here we return count found
      found: people.length,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown" }, { status: 500 });
  }
}