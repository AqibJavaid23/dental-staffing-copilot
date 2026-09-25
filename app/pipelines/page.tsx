"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import BrandLoader from "@/app/components/BrandLoader";
import { useAuth } from "@/app/lib/useAuth";
type Pipeline = {
  shared?: boolean;
  owner_id?: string | null;
  sharedByName?: string | null;
  sharedWithNames?: string[];
  id: string;
  name: string;
  source_tab: string;
  project: string;
  created_at: string;
  pipeline_type: string | null;
  total: number;
  enriched: number;
};

const PROJECT_STYLES: Record<string, { label: string; classes: string }> = {

  DSCP: { label: "DSCP", classes: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" },
};

// A pipeline's type: explicit override, else auto from source (Jobs = hiring, else talent)
const typeOf = (p: { pipeline_type?: string | null; source_tab?: string }) =>
  p.pipeline_type || (p.source_tab === "Jobs" ? "hiring" : "talent");

function PipelinesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectFilter = searchParams.get("project");

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Phase F: "view as user" picker
  const [viewableUsers, setViewableUsers] = useState<{ id: string; label: string; role: string }[]>([]);
  const [viewUserId, setViewUserId] = useState<string>("all");

  // Talent / Hiring type filter
  const [typeFilter, setTypeFilter] = useState<"all" | "talent" | "hiring" | "mydata" | "shared">("all");

  const { profile, checking } = useAuth();

  const load = async () => {
    if (!profile) return;
    setLoading(true); setError(null);
    try {
      let query = supabase.from("pipelines").select("*").order("created_at", { ascending: false });
      if (projectFilter) query = query.eq("project", projectFilter);

      // Role-based visibility
      if (profile.role === "member") {
        // Members see only their own
        query = query.eq("owner_id", profile.id);
      } else if (viewUserId !== "all") {
        // Admin/Manager focused on one specific person
        query = query.eq("owner_id", viewUserId);
      } else if (profile.role === "manager") {
        // Manager, viewing everyone they're allowed to: own + all Members
        const { data: members } = await supabase
          .from("profiles")
          .select("id")
          .eq("role", "member");
        const memberIds = (members ?? []).map((m) => m.id);
        const visibleIds = [profile.id, ...memberIds];
        query = query.in("owner_id", visibleIds);
      }
      // Admin viewing "all": no filter — sees everything

      const { data: pipes, error: pErr } = await query;
      if (pErr) throw pErr;

      // Include pipelines shared with me (any role)
      const { data: myShareRows } = await supabase.from("pipeline_shares").select("pipeline_id").eq("user_id", profile.id);
      const sharedIdList = (myShareRows ?? []).map((x) => x.pipeline_id as string);
      const sharedSet = new Set(sharedIdList);
      const ownIds = new Set((pipes ?? []).map((p) => p.id));
      const missingSharedIds = sharedIdList.filter((pid) => !ownIds.has(pid));
      let sharedPipes: NonNullable<typeof pipes> = [];
      if (missingSharedIds.length > 0) {
        let sq = supabase.from("pipelines").select("*").in("id", missingSharedIds);
        if (projectFilter) sq = sq.eq("project", projectFilter);
        const { data: sp } = await sq;
        sharedPipes = sp ?? [];
      }
      const allPipes = [...(pipes ?? []), ...sharedPipes];

      // Who shared each one with me + who I shared each one with
      const allIds = allPipes.map((p) => p.id);
      const shareInfo: Record<string, { byName?: string | null; withNames: string[] }> = {};
      if (allIds.length > 0) {
        const { data: allShares } = await supabase.from("pipeline_shares").select("pipeline_id, user_id, shared_by").in("pipeline_id", allIds);
        const uids = new Set<string>();
        (allShares ?? []).forEach((sh) => { if (sh.user_id) uids.add(sh.user_id); if (sh.shared_by) uids.add(sh.shared_by); });
        const nameMap: Record<string, string> = {};
        if (uids.size > 0) {
          const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", [...uids]);
          (profs ?? []).forEach((u) => { nameMap[u.id] = u.full_name || u.email || "Someone"; });
        }
        (allShares ?? []).forEach((sh) => {
          const info = shareInfo[sh.pipeline_id] || { withNames: [] };
          if (sh.user_id === profile.id) info.byName = sh.shared_by ? (nameMap[sh.shared_by] || "Someone") : "Someone";
          const owner = allPipes.find((x) => x.id === sh.pipeline_id);
          if (owner && owner.owner_id === profile.id) {
            const nm = nameMap[sh.user_id] || "Someone";
            if (!info.withNames.includes(nm)) info.withNames.push(nm);
          }
          shareInfo[sh.pipeline_id] = info;
        });
      }

      const withStats: Pipeline[] = await Promise.all(
        allPipes.map(async (p) => {
          const [{ count: total }, { count: enriched }] = await Promise.all([
            supabase.from("pipeline_rows").select("*", { count: "exact", head: true }).eq("pipeline_id", p.id),
            supabase.from("pipeline_rows").select("*", { count: "exact", head: true }).eq("pipeline_id", p.id).in("enrichment_status", ["enriched", "partial"]),
          ]);
          return {
            ...p, total: total ?? 0, enriched: enriched ?? 0,
            shared: sharedSet.has(p.id),
            sharedByName: shareInfo[p.id]?.byName ?? null,
            sharedWithNames: shareInfo[p.id]?.withNames ?? [],
          };
        })
      );
      setPipelines(withStats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pipelines");
    } finally { setLoading(false); }
  };

  useEffect(() => { if (profile) load(); }, [projectFilter, profile, viewUserId]);
// Load the list of users this person is allowed to "view as"
  useEffect(() => {
    if (!profile) return;
    if (profile.role === "member") return; // members don't get the picker

    const loadUsers = async () => {
      let q = supabase.from("profiles").select("id, email, full_name, role");
      if (profile.role === "manager") {
        // Manager can view themselves + members
        q = q.in("role", ["member", "manager"]);
      }
      // Admin: all profiles
      const { data } = await q;
      let list = (data ?? []).map((u) => ({
        id: u.id,
        label: (u.full_name || u.email || "Unknown") + (u.id === profile.id ? " (me)" : ""),
        role: u.role,
      }));
      // Manager shouldn't see OTHER managers in the picker — only self + members
      if (profile.role === "manager") {
        list = list.filter((u) => u.role === "member" || u.id === profile.id);
      }
      list.sort((a, b) => a.label.localeCompare(b.label));
      setViewableUsers(list);
    };
    loadUsers();
  }, [profile]);

  const deletePipeline = async (id: string, name: string) => {
    if (!confirm(`Delete pipeline "${name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("pipelines").delete().eq("id", id);
    if (error) { alert("Delete failed: " + error.message); return; }
    load();
  };

  // Manually change a pipeline's type (talent <-> hiring)
  const changeType = async (id: string, newType: string) => {
    const { error } = await supabase.from("pipelines").update({ pipeline_type: newType }).eq("id", id);
    if (error) { alert("Failed to update type: " + error.message); return; }
    setPipelines((prev) => prev.map((p) => (p.id === id ? { ...p, pipeline_type: newType } : p)));
  };

  const title =
    profile?.role === "admin" ? "All Pipelines (Admin)"
    : profile?.role === "manager" ? "Team Pipelines"
    : "My Pipelines";
  const backHref = "/dashboard";
  const backLabel = projectFilter ? `← Back to ${projectFilter}` : "← Back";
  const emptyLink = "/dashboard/provider-database";
  const emptyLabel = "Go to Provider Database";

  const isUpload = (p: Pipeline) => p.source_tab === "Upload";
  const visiblePipelines = pipelines.filter((p) => {
    if (typeFilter === "all") return true;
    if (typeFilter === "mydata") return isUpload(p);
    if (typeFilter === "shared") return !!p.sharedByName || (p.sharedWithNames?.length ?? 0) > 0;
    return !isUpload(p) && typeOf(p) === typeFilter;
  });

if (checking) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading..." /></div>;
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-900">
      <header className="flex justify-between items-center px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <Link href={backHref} className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition">{backLabel}</Link>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{title}</h1>
        <div className="w-48 flex justify-end">
          {profile && profile.role !== "member" && viewableUsers.length > 0 && (
            <select
              value={viewUserId}
              onChange={(e) => setViewUserId(e.target.value)}
              className="text-xs border border-zinc-300 dark:border-zinc-600 rounded-lg px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="View pipelines for a specific person"
            >
              <option value="all">Everyone</option>
              {viewableUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.label}</option>
              ))}
            </select>
          )}
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {/* Talent / Hiring filter */}
          <div className="flex gap-2">
            {([["all", "All"], ["talent", "🦷 Talent"], ["hiring", "🏢 Hiring Practices"], ["mydata", "📤 My Data"], ["shared", "🔗 Shared"]] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setTypeFilter(val)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition ${
                  typeFilter === val ? "bg-blue-600 text-white border-transparent" : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {error ? <div className="p-6 text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg">{error}</div>
         : loading ? <BrandLoader label="Loading pipelines..." />
          : visiblePipelines.length === 0 ? (
            <div className="text-center py-20">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">No pipelines yet</h2>
              <p className="text-zinc-500 dark:text-zinc-400 mb-6">
                {projectFilter
                  ? `Select some rows in ${projectFilter} and save your first pipeline.`
                  : "Head to the Provider Database, select some providers, and save your first pipeline."}
              </p>
              <Link href={emptyLink} className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition">{emptyLabel}</Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {visiblePipelines.map((p) => {
                const pct = p.total > 0 ? Math.round((p.enriched / p.total) * 100) : 0;
                const tag = PROJECT_STYLES[p.project] ?? { label: p.project, classes: "bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300" };
                const ptype = typeOf(p);
                return (
                  <div key={p.id} className="card-hover bg-white dark:bg-zinc-800 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-700 p-5">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <Link href={`/pipelines/${p.id}`} className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${tag.classes}`}>{tag.label}</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${ptype === "hiring" ? "bg-orange-100 text-orange-700" : "bg-sky-100 text-sky-700"}`}>
                            {ptype === "hiring" ? "🏢 Hiring" : "🦷 Talent"}
                          </span>
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">{p.source_tab}s</span>
                          {p.sharedByName && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Shared by {p.sharedByName}</span>}
                          {p.sharedWithNames && p.sharedWithNames.length > 0 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700" title={p.sharedWithNames.join(", ")}>Shared with {p.sharedWithNames.length}</span>}
                        </div>
                        <h3 className="font-semibold text-zinc-900 dark:text-zinc-50 truncate hover:text-blue-600 dark:hover:text-blue-400 transition">{p.name}</h3>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{new Date(p.created_at).toLocaleDateString()}</p>
                      </Link>
                      <div className="flex flex-col items-end gap-1">
                        <button onClick={() => deletePipeline(p.id, p.name)} className="text-zinc-400 hover:text-red-500 transition text-sm" title="Delete">✕</button>
                        <select
                          value={ptype}
                          onChange={(e) => changeType(p.id, e.target.value)}
                          className="text-[10px] border border-zinc-200 dark:border-zinc-600 rounded px-1 py-0.5 bg-white dark:bg-zinc-800 text-zinc-500"
                          title="Change pipeline type"
                        >
                          <option value="talent">Talent</option>
                          <option value="hiring">Hiring</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-600 dark:text-zinc-400">Enriched</span>
                        <span className="font-medium text-zinc-900 dark:text-zinc-50">{p.enriched} / {p.total}</span>
                      </div>
                      <div className="h-2 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-xs text-right text-zinc-500 dark:text-zinc-400">{pct}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function PipelinesPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-zinc-400">Loading...</div>}>
      <PipelinesInner />
    </Suspense>
  );
}