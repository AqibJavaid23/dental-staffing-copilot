"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import BrandLoader from "@/app/components/BrandLoader";

type Task = {
  id: string; client_id: string; title: string; urgency: string;
  deadline: string | null; status: string; clientName?: string;
};

const URGENCY = {
  critical: { label: "Critical", dot: "#dc2626", bg: "#fef2f2", text: "#dc2626", emoji: "🔴" },
  high: { label: "High", dot: "#ea580c", bg: "#fff7ed", text: "#ea580c", emoji: "🟠" },
  medium: { label: "Medium", dot: "#d97706", bg: "#fffbeb", text: "#b45309", emoji: "🟡" },
  low: { label: "Low", dot: "#059669", bg: "#ecfdf5", text: "#059669", emoji: "🟢" },
};
const urg = (u: string) => URGENCY[u as keyof typeof URGENCY] || URGENCY.medium;

export default function MyClientTasksPage() {
  const { profile, checking } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"open" | "all">("open");

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    // Tasks assigned to me across all clients
    const { data: ts } = await supabase.from("client_tasks").select("*").eq("assigned_to", profile.id).order("deadline", { ascending: true });
    const list = (ts ?? []) as Task[];
    // client names
    const clientIds = [...new Set(list.map((t) => t.client_id))];
    const nameById: Record<string, string> = {};
    if (clientIds.length > 0) {
      const { data: cls } = await supabase.from("clients").select("id, name").in("id", clientIds);
      (cls ?? []).forEach((c) => { nameById[c.id] = c.name; });
    }
    setTasks(list.map((t) => ({ ...t, clientName: nameById[t.client_id] || "Unknown" })));
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  if (checking || loading) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading..." /></div>;

  const shown = tasks.filter((t) => filter === "all" ? true : t.status !== "completed");
  const today = new Date(new Date().toDateString());

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <main className="flex-1 p-6">
        <div className="max-w-3xl mx-auto space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold" style={{ color: "var(--deep-navy)" }}>My Tasks</h1>
              <p className="text-sm text-zinc-500 mt-0.5">Tasks assigned to you across all clients.</p>
            </div>
            <Link href="/clients" className="text-sm text-zinc-500 hover:text-zinc-900 transition">← All clients</Link>
          </div>

          <div className="flex gap-1 bg-zinc-100 rounded-lg p-1 w-fit">
            <button onClick={() => setFilter("open")} className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${filter === "open" ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500"}`}>Open</button>
            <button onClick={() => setFilter("all")} className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${filter === "all" ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500"}`}>All</button>
          </div>

          {shown.length === 0 ? (
            <div className="text-center py-16 text-zinc-400">No tasks assigned to you{filter === "open" ? " that are open" : ""}.</div>
          ) : (
            <div className="space-y-2">
              {shown.map((t) => {
                const u = urg(t.urgency);
                const overdue = t.status !== "completed" && t.deadline && new Date(t.deadline) < today;
                return (
                  <Link key={t.id} href={`/clients/${t.client_id}`} className="block rounded-lg border-l-4 p-3 hover:shadow-sm transition" style={{ borderLeftColor: u.dot, backgroundColor: t.status === "completed" ? "#fafafa" : u.bg }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className={`font-medium text-sm ${t.status === "completed" ? "line-through text-zinc-400" : "text-zinc-900"}`}>{t.title}</div>
                        <div className="text-xs text-zinc-500 mt-0.5">🦷 {t.clientName}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 text-[11px]">
                        <span className="font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: u.dot + "22", color: u.text }}>{u.emoji} {u.label}</span>
                        {t.deadline && <span className={overdue ? "text-red-600 font-semibold" : "text-zinc-500"}>{overdue ? "⚠ " : "📅 "}{new Date(t.deadline).toLocaleDateString()}</span>}
                      </div>
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