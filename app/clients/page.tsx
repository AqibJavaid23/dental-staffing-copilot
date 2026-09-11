"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import BrandLoader from "@/app/components/BrandLoader";

type Client = {
  id: string;
  name: string;
  next_coaching_call: string | null;
  next_touch_date: string | null;
  next_touch_name: string | null;
  created_at: string;
  openTasks?: number;
  criticalTasks?: number;
};

export default function ClientsPage() {
  const router = useRouter();
  const { profile, checking } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
    const list = (data ?? []) as Client[];
    // task counts per client
    const withCounts: Client[] = await Promise.all(list.map(async (c) => {
      const { data: tasks } = await supabase.from("client_tasks").select("urgency, status").eq("client_id", c.id).neq("status", "completed");
      const openTasks = tasks?.length ?? 0;
      const criticalTasks = (tasks ?? []).filter((t) => t.urgency === "critical").length;
      return { ...c, openTasks, criticalTasks };
    }));
    setClients(withCounts);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createClient = async () => {
    if (!newName.trim() || !profile) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.from("clients").insert({ name: newName.trim(), created_by: profile.id }).select().single();
      if (error) throw error;
      setNewName("");
      router.push(`/clients/${data.id}`);
    } catch (e) {
      alert("Failed: " + (e instanceof Error ? e.message : "unknown"));
    } finally { setCreating(false); }
  };

  const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

  if (checking || loading) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading..." /></div>;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <main className="flex-1 p-6">
        <div className="max-w-5xl mx-auto space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-semibold" style={{ color: "var(--deep-navy)" }}>🦷 Clients</h1>
              <p className="text-sm text-zinc-500 mt-0.5">Every client at a glance — coaching calls, touch points, and open tasks.</p>
            </div>
            <Link href="/choose" className="text-sm text-zinc-500 hover:text-zinc-900 transition">⇄ Switch</Link>
          </div>

          {/* Create client */}
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-4">
            <div className="flex gap-2">
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createClient()} placeholder="New client name (e.g. Bright Smile Dental)" className="flex-1 px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              <button onClick={createClient} disabled={creating || !newName.trim()} className="px-4 py-2 text-sm font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition disabled:opacity-50">Add Client</button>
            </div>
          </div>

          {clients.length === 0 ? (
            <div className="text-center py-16 text-zinc-400">No clients yet. Add your first client above.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {clients.map((c) => (
                <Link key={c.id} href={`/clients/${c.id}`} className="block bg-white rounded-2xl shadow-sm border border-zinc-200 p-5 hover:shadow-md transition">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-zinc-900 text-lg">{c.name}</h3>
                    <div className="flex gap-1.5 shrink-0">
                      {(c.criticalTasks ?? 0) > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{c.criticalTasks} critical</span>}
                      {(c.openTasks ?? 0) > 0 && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">{c.openTasks} open</span>}
                    </div>
                  </div>
                  <div className="mt-3 space-y-1 text-xs">
                    <div className="flex items-center gap-2"><span className="text-zinc-400">📞 Next coaching call:</span> <span className="text-zinc-700">{fmtDate(c.next_coaching_call)}</span></div>
                    <div className="flex items-center gap-2"><span className="text-zinc-400">🤝 Next touch point:</span> <span className="text-zinc-700">{c.next_touch_name ? `${c.next_touch_name} · ${fmtDate(c.next_touch_date)}` : fmtDate(c.next_touch_date)}</span></div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}