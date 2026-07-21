"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import BrandLoader from "@/app/components/BrandLoader";
type Pipeline = {
  id: string;
  name: string;
  source_tab: string;
  project: string;
  created_at: string;
  total: number;
  enriched: number;
};

const PROJECT_STYLES: Record<string, { label: string; classes: string }> = {
  
  DSCP: { label: "DSCP", classes: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" },
};

function PipelinesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectFilter = searchParams.get("project");

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (localStorage.getItem("loggedIn") !== "true") router.push("/");
  }, [router]);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      let query = supabase.from("pipelines").select("*").order("created_at", { ascending: false });
      if (projectFilter) query = query.eq("project", projectFilter);
      const { data: pipes, error: pErr } = await query;
      if (pErr) throw pErr;

      const withStats: Pipeline[] = await Promise.all(
        (pipes ?? []).map(async (p) => {
          const [{ count: total }, { count: enriched }] = await Promise.all([
            supabase.from("pipeline_rows").select("*", { count: "exact", head: true }).eq("pipeline_id", p.id),
            supabase.from("pipeline_rows").select("*", { count: "exact", head: true }).eq("pipeline_id", p.id).in("enrichment_status", ["enriched", "partial"]),
          ]);
          return { ...p, total: total ?? 0, enriched: enriched ?? 0 };
        })
      );
      setPipelines(withStats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pipelines");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [projectFilter]);

  const deletePipeline = async (id: string, name: string) => {
    if (!confirm(`Delete pipeline "${name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("pipelines").delete().eq("id", id);
    if (error) { alert("Delete failed: " + error.message); return; }
    load();
  };

  const title = projectFilter ? `${projectFilter} Pipelines` : "My Pipelines";
  const backHref = "/dashboard";
  const backLabel = projectFilter ? `← Back to ${projectFilter}` : "← Back";
  const emptyLink = "/dashboard/provider-database";
  const emptyLabel = "Go to Provider Database";

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-900">
      <header className="flex justify-between items-center px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <Link href={backHref} className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition">{backLabel}</Link>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{title}</h1>
        <div className="w-24" />
      </header>

      <main className="flex-1 p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {error ? <div className="p-6 text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg">{error}</div>
         : loading ? <BrandLoader label="Loading pipelines..." />
          : pipelines.length === 0 ? (
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
              {pipelines.map((p) => {
                const pct = p.total > 0 ? Math.round((p.enriched / p.total) * 100) : 0;
                const tag = PROJECT_STYLES[p.project] ?? { label: p.project, classes: "bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300" };
                return (
                  <div key={p.id} className="card-hover bg-white dark:bg-zinc-800 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-700 p-5">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <Link href={`/pipelines/${p.id}`} className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${tag.classes}`}>{tag.label}</span>
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">{p.source_tab}s</span>
                        </div>
                        <h3 className="font-semibold text-zinc-900 dark:text-zinc-50 truncate hover:text-blue-600 dark:hover:text-blue-400 transition">{p.name}</h3>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{new Date(p.created_at).toLocaleDateString()}</p>
                      </Link>
                      <button onClick={() => deletePipeline(p.id, p.name)} className="text-zinc-400 hover:text-red-500 transition text-sm" title="Delete">✕</button>
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