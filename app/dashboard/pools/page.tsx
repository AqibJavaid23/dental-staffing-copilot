"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import BrandLoader from "@/app/components/BrandLoader";

type Pool = {
  id: string;
  owner_id: string | null;
  company_name: string;
  job_title: string | null;
  city: string | null;
  state: string | null;
  created_at: string;
  talentCount: number;
};

export default function PoolsPage() {
  const { profile, checking } = useAuth();
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true); setError(null);
    try {
      let query = supabase.from("pools").select("*").order("created_at", { ascending: false });
      // Role-based visibility (same model as pipelines)
      if (profile.role === "member") {
        query = query.eq("owner_id", profile.id);
      } else if (profile.role === "manager") {
        const { data: members } = await supabase.from("profiles").select("id").eq("role", "member");
        const ids = [profile.id, ...(members ?? []).map((m) => m.id)];
        query = query.in("owner_id", ids);
      }
      const { data, error: e } = await query;
      if (e) throw e;

      const withCounts: Pool[] = await Promise.all(
        (data ?? []).map(async (p) => {
          const { count } = await supabase.from("pool_talent").select("*", { count: "exact", head: true }).eq("pool_id", p.id);
          return { ...p, talentCount: count ?? 0 };
        })
      );
      setPools(withCounts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pools");
    } finally { setLoading(false); }
  }, [profile]);

  useEffect(() => { if (profile) load(); }, [profile, load]);

  const deletePool = async (id: string, name: string) => {
    if (!confirm(`Delete the pool for "${name}"? This removes the pool and its matched talent list (talent pipelines are untouched).`)) return;
    const { error } = await supabase.from("pools").delete().eq("id", id);
    if (error) { alert("Delete failed: " + error.message); return; }
    load();
  };

  if (checking) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading..." /></div>;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="flex justify-between items-center px-6 py-4 border-b border-zinc-200 bg-white">
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900 transition">← Back</Link>
        <h1 className="text-lg font-semibold text-zinc-900">Talent Pools</h1>
        <Link href="/pipelines?" className="text-sm text-blue-600 hover:underline">Pipelines →</Link>
      </header>

      <main className="flex-1 p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          <p className="text-sm text-zinc-500">
            Each pool is a hiring practice. Open one to match your talent to the role, then reach out with candidates.
          </p>

          {error ? <div className="p-6 text-red-500 bg-red-50 rounded-lg">{error}</div>
          : loading ? <BrandLoader label="Loading pools..." />
          : pools.length === 0 ? (
            <div className="text-center py-20">
              <h2 className="text-xl font-semibold text-zinc-900 mb-2">No pools yet</h2>
              <p className="text-zinc-500 mb-6">Open a Hiring pipeline, and click <span className="font-medium">+ Pool</span> on a company to start one.</p>
              <Link href="/pipelines" className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition">Go to Pipelines</Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pools.map((p) => (
                <div key={p.id} className="card-hover bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/dashboard/pools/${p.id}`} className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">🏢 Hiring</span>
                        {p.job_title && <span className="text-xs text-zinc-500 truncate">{p.job_title}</span>}
                      </div>
                      <h3 className="font-semibold text-zinc-900 truncate hover:text-blue-600 transition">{p.company_name}</h3>
                      <p className="text-xs text-zinc-500 mt-0.5">{[p.city, p.state].filter(Boolean).join(", ") || "—"} · {new Date(p.created_at).toLocaleDateString()}</p>
                    </Link>
                    <button onClick={() => deletePool(p.id, p.company_name)} className="text-zinc-400 hover:text-red-500 transition text-sm" title="Delete pool">✕</button>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-sm text-zinc-600">Matched talent</span>
                    <span className="text-sm font-medium text-zinc-900">{p.talentCount}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}