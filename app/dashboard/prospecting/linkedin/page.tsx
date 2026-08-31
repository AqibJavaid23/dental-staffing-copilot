"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import BrandLoader from "@/app/components/BrandLoader";

type Flow = { id: string; name: string; created_at: string; nodes: unknown[]; edges: unknown[] };

export default function LinkedInFlowsPage() {
  const router = useRouter();
  const { profile, checking } = useAuth();
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase.from("linkedin_flows").select("*").eq("owner_id", profile.id).order("created_at", { ascending: false });
    setFlows((data ?? []) as Flow[]);
    setLoading(false);
  }, [profile]);

  useEffect(() => { if (profile) load(); }, [profile, load]);

  const createFlow = async () => {
    if (!profile) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.from("linkedin_flows")
        .insert({ owner_id: profile.id, name: `LinkedIn Flow — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, nodes: [], edges: [] })
        .select().single();
      if (error) throw error;
      router.push(`/dashboard/prospecting/linkedin/${data.id}`);
    } catch (e) {
      alert("Failed: " + (e instanceof Error ? e.message : "unknown"));
    } finally { setCreating(false); }
  };

  const deleteFlow = async (id: string) => {
    if (!confirm("Delete this flow?")) return;
    await supabase.from("linkedin_flows").delete().eq("id", id);
    load();
  };

  if (checking || loading) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading..." /></div>;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <main className="flex-1 p-6">
        <div className="max-w-3xl mx-auto space-y-5">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold" style={{ color: "var(--deep-navy)" }}>🔗 LinkedIn Flows</h1>
            <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900 transition">← Dashboard</Link>
          </div>
          <p className="text-sm text-zinc-500">Design LinkedIn outreach flows on a canvas. (Execution comes later — this builds the playbook.)</p>

          <button onClick={createFlow} disabled={creating} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
            {creating ? "Creating..." : "+ New Flow"}
          </button>

          {flows.length === 0 ? (
            <div className="text-center py-16 text-zinc-400">No flows yet. Create one to open the canvas.</div>
          ) : (
            <div className="space-y-3">
              {flows.map((f) => (
                <div key={f.id} className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-zinc-900">{f.name}</h3>
                    <p className="text-xs text-zinc-400 mt-0.5">{(f.nodes?.length ?? 0)} steps · {new Date(f.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/dashboard/prospecting/linkedin/${f.id}`} className="text-sm text-blue-600 hover:underline">Open canvas</Link>
                    <button onClick={() => deleteFlow(f.id)} className="text-sm text-zinc-400 hover:text-red-500">Delete</button>
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