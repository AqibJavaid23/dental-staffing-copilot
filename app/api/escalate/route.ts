import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// Runs on a schedule (Vercel Cron). Finds Critical tasks that are still Open,
// were created more than 24h ago, and haven't been escalated yet — then
// notifies every manager/admin and marks the task escalated.
export async function GET(req: NextRequest) {
  // Optional protection: if CRON_SECRET is set in the environment, require it.
  // Vercel Cron automatically sends this header when CRON_SECRET is configured.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  // ?preview=1 -> show what WOULD escalate (ignores the 24h wait, writes nothing)
  const preview = new URL(req.url).searchParams.get("preview") === "1";
  const cutoff = preview
    ? new Date().toISOString()
    : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Critical + still open + not yet escalated + old enough
  const { data: tasks, error: tErr } = await supabaseAdmin
    .from("client_tasks")
    .select("id, client_id, title, created_at")
    .eq("urgency", "critical")
    .eq("status", "open")
    .is("escalated_at", null)
    .lt("created_at", cutoff);
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  if (!tasks || tasks.length === 0) {
    return NextResponse.json({ escalated: 0, notified: 0, preview });
  }

  // Client names for friendly messages
  const { data: cls } = await supabaseAdmin.from("clients").select("id, name");
  const clientName: Record<string, string> = {};
  (cls ?? []).forEach((c) => { clientName[c.id] = c.name; });

  // Everyone who should be alerted
  const { data: mgrs } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .in("role", ["manager", "admin"]);
  const managerIds = (mgrs ?? []).map((m) => m.id);

  if (preview) {
    return NextResponse.json({
      preview: true,
      wouldEscalate: tasks.length,
      wouldNotifyManagers: managerIds.length,
      tasks: tasks.map((t) => ({ title: t.title, client: clientName[t.client_id] || "Unknown" })),
    });
  }

  // Build one notification per (task x manager)
  const rows: {
    user_id: string; message: string; link: string; type: string; actor_name: string;
  }[] = [];
  for (const t of tasks) {
    const cname = clientName[t.client_id] || "a client";
    for (const uid of managerIds) {
      rows.push({
        user_id: uid,
        message: `⏰ Escalation: Critical task "${t.title}" on ${cname} has been open for over 24h with no action.`,
        link: `/clients/${t.client_id}`,
        type: "escalation",
        actor_name: "Auto-escalation",
      });
    }
  }

  if (rows.length > 0) {
    const { error: nErr } = await supabaseAdmin.from("notifications").insert(rows);
    if (nErr) return NextResponse.json({ error: nErr.message }, { status: 500 });
  }

  // Mark these tasks escalated so they aren't re-notified
  const { error: uErr } = await supabaseAdmin
    .from("client_tasks")
    .update({ escalated_at: new Date().toISOString() })
    .in("id", tasks.map((t) => t.id));
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  return NextResponse.json({ escalated: tasks.length, notified: rows.length });
}