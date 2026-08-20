"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import BrandLoader from "@/app/components/BrandLoader";

type Report = {
  id: string;
  owner_id: string;
  title: string;
  kind: string;
  status: string;
  is_manager_task: boolean;
  week_of: string | null;
  created_at: string;
  ownerName?: string;
  itemCount?: number;
  doneCount?: number;
};

const STATUS_STYLE: Record<string, { label: string; classes: string }> = {
  draft: { label: "Draft", classes: "bg-zinc-100 text-zinc-600" },
  submitted: { label: "Submitted", classes: "bg-amber-100 text-amber-700" },
  approved: { label: "Approved", classes: "bg-blue-100 text-blue-700" },
  completed: { label: "Completed ✓", classes: "bg-emerald-100 text-emerald-700" },
};

export default function ReportsPage() {
  const router = useRouter();
  const { profile, checking } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const isManagerOrAdmin = profile?.role === "manager" || profile?.role === "admin";

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true); setError(null);
    try {
      let query = supabase.from("reports").select("*").order("created_at", { ascending: false });
      if (profile.role === "member") {
        query = query.eq("owner_id", profile.id);
      } else if (profile.role === "manager") {
        const { data: members } = await supabase.from("profiles").select("id").eq("role", "member");
        const ids = [profile.id, ...(members ?? []).map((m) => m.id)];
        query = query.in("owner_id", ids);
      }
      const { data, error: e } = await query;
      if (e) throw e;

      const { data: profs } = await supabase.from("profiles").select("id, full_name, email");
      const nameById: Record<string, string> = {};
      (profs ?? []).forEach((p) => { nameById[p.id] = p.full_name || p.email || "Unknown"; });

      const withMeta: Report[] = await Promise.all((data ?? []).map(async (r) => {
        const { data: items } = await supabase.from("report_items").select("done").eq("report_id", r.id);
        const itemCount = items?.length ?? 0;
        const doneCount = (items ?? []).filter((i) => i.done).length;
        return { ...r, ownerName: nameById[r.owner_id] || "Unknown", itemCount, doneCount };
      }));
      setReports(withMeta);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reports");
    } finally { setLoading(false); }
  }, [profile]);

  useEffect(() => { if (profile) load(); }, [profile, load]);

  const createReport = async (kind: "weekly" | "ongoing", asManagerTask: boolean) => {
    if (!profile) return;
    setCreating(true);
    try {
      const label = asManagerTask ? "My Task" : (kind === "weekly" ? "Weekly plan" : "Task plan");
      const title = `${label} — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
      const { data, error: e } = await supabase.from("reports")
        .insert({
          owner_id: profile.id,
          title,
          kind,
          is_manager_task: asManagerTask,
          status: asManagerTask ? "approved" : "draft",
          approved_at: asManagerTask ? new Date().toISOString() : null,
          approved_by: asManagerTask ? profile.id : null,
          week_of: kind === "weekly" ? new Date().toISOString().slice(0, 10) : null,
        })
        .select().single();
      if (e) throw e;
      router.push(`/dashboard/reports/${data.id}`);
    } catch (e) {
      alert("Failed to create: " + (e instanceof Error ? e.message : "unknown"));
    } finally { setCreating(false); }
  };

  if (checking) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading..." /></div>;

  const title = profile?.role === "admin" ? "All Reports (Admin)" : profile?.role === "manager" ? "Team Reports" : "My Reports";

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="flex justify-between items-center px-6 py-4 border-b border-zinc-200 bg-white">
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900 transition">← Back</Link>
        <h1 className="text-lg font-semibold text-zinc-900">{title}</h1>
        <div className="w-20" />
      </header>

      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-5">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => createReport("weekly", false)} disabled={creating} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50">+ Weekly Report</button>
            <button onClick={() => createReport("ongoing", false)} disabled={creating} className="px-4 py-2 text-sm font-medium border border-zinc-300 text-zinc-700 rounded-lg hover:bg-zinc-50 transition disabled:opacity-50">+ Task Plan</button>
            {isManagerOrAdmin && (
              <button onClick={() => createReport("ongoing", true)} disabled={creating} className="px-4 py-2 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition disabled:opacity-50">+ My Own Task</button>
            )}
          </div>

          {error ? <div className="p-6 text-red-500 bg-red-50 rounded-lg">{error}</div>
          : loading ? <BrandLoader label="Loading reports..." />
          : reports.length === 0 ? (
            <div className="text-center py-16 text-zinc-400">No reports yet. {profile?.role === "member" ? "Create your weekly plan above." : "Create a report or your own task above."}</div>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => {
                const st = STATUS_STYLE[r.status] || STATUS_STYLE.draft;
                const pct = r.itemCount ? Math.round((r.doneCount! / r.itemCount) * 100) : 0;
                return (
                  <Link key={r.id} href={`/dashboard/reports/${r.id}`} className="block bg-white rounded-2xl shadow-sm border border-zinc-200 p-5 hover:shadow-md transition">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${st.classes}`}>{st.label}</span>
                          {r.is_manager_task && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">My Task</span>}
                          {!r.is_manager_task && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600">{r.kind === "weekly" ? "Weekly" : "Task"}</span>}
                          {profile?.role !== "member" && <span className="text-xs text-zinc-500">{r.ownerName}</span>}
                        </div>
                        <h3 className="font-semibold text-zinc-900 truncate">{r.title}</h3>
                        <p className="text-xs text-zinc-400 mt-0.5">{new Date(r.created_at).toLocaleDateString()}</p>
                      </div>
                      {(r.itemCount ?? 0) > 0 && (
                        <div className="text-right shrink-0">
                          <div className="text-sm font-medium text-zinc-900">{r.doneCount}/{r.itemCount}</div>
                          <div className="w-20 h-1.5 bg-zinc-100 rounded-full overflow-hidden mt-1">
                            <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}