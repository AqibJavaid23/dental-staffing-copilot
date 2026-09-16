"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import BrandLoader from "@/app/components/BrandLoader";

type Task = {
  id: string; client_id: string; title: string; urgency: string;
  deadline: string | null; status: string; assigned_to: string | null;
  clientName?: string; assigneeName?: string;
};
type BlockedRole = {
  id: string; client_id: string; title: string; blocker_note: string | null;
  owner_id: string | null; clientName?: string; ownerName?: string;
};

const URGENCY = {
  critical: { label: "Critical", dot: "#dc2626", bg: "#fef2f2", text: "#dc2626", emoji: "🔴" },
  high: { label: "High", dot: "#ea580c", bg: "#fff7ed", text: "#ea580c", emoji: "🟠" },
  medium: { label: "Medium", dot: "#d97706", bg: "#fffbeb", text: "#b45309", emoji: "🟡" },
  low: { label: "Low", dot: "#059669", bg: "#ecfdf5", text: "#059669", emoji: "🟢" },
};
const urg = (u: string) => URGENCY[u as keyof typeof URGENCY] || URGENCY.medium;

export default function AllCriticalPage() {
  const { checking } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [roles, setRoles] = useState<BlockedRole[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    // Name lookups
    const { data: cls } = await supabase.from("clients").select("id, name");
    const clientName: Record<string, string> = {};
    (cls ?? []).forEach((c) => { clientName[c.id] = c.name; });

    const { data: profs } = await supabase.from("profiles").select("id, full_name, email");
    const personName: Record<string, string> = {};
    (profs ?? []).forEach((p) => { personName[p.id] = p.full_name || p.email; });

    // Critical + High open tasks across all clients
    const { data: ts } = await supabase
      .from("client_tasks")
      .select("*")
      .in("urgency", ["critical", "high"])
      .neq("status", "completed");
    const taskList = ((ts ?? []) as Task[]).map((t) => ({
      ...t,
      clientName: clientName[t.client_id] || "Unknown",
      assigneeName: t.assigned_to ? (personName[t.assigned_to] || "—") : "Unassigned",
    }));
    const rank: Record<string, number> = { critical: 0, high: 1 };
    taskList.sort((a, b) => {
      const r = (rank[a.urgency] ?? 9) - (rank[b.urgency] ?? 9);
      if (r !== 0) return r;
      const ad = a.deadline ? new Date(a.deadline).getTime() : Infinity;
      const bd = b.deadline ? new Date(b.deadline).getTime() : Infinity;
      return ad - bd;
    });
    setTasks(taskList);

    // Blocked roles across all clients
    const { data: rs } = await supabase
      .from("client_roles")
      .select("*")
      .eq("posting_status", "blocked");
    setRoles(((rs ?? []) as BlockedRole[]).map((r) => ({
      ...r,
      clientName: clientName[r.client_id] || "Unknown",
      ownerName: r.owner_id ? (personName[r.owner_id] || "—") : "—",
    })));

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (checking || loading) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading..." /></div>;

  const today = new Date(new Date().toDateString());
  const criticalCount = tasks.filter((t) => t.urgency === "critical").length;
  const highCount = tasks.filter((t) => t.urgency === "high").length;
  const nothing = tasks.length === 0 && roles.length === 0;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <main className="flex-1 p-6">
        <div className="max-w-3xl mx-auto space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-semibold" style={{ color: "var(--deep-navy)" }}>🔥 All Critical</h1>
              <p className="text-sm text-zinc-500 mt-0.5">Everything urgent across every client, in one place.</p>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/clients/my-tasks" className="text-sm font-medium text-teal-600 hover:text-teal-800 transition">📋 My Tasks</Link>
              <Link href="/clients" className="text-sm text-zinc-500 hover:text-zinc-900 transition">← All clients</Link>
            </div>
          </div>

          {/* Summary chips */}
          <div className="flex gap-2 flex-wrap text-[11px]">
            <span className="px-2 py-1 rounded-lg bg-red-50 text-red-700 font-medium">🔴 {criticalCount} critical task{criticalCount === 1 ? "" : "s"}</span>
            <span className="px-2 py-1 rounded-lg bg-orange-50 text-orange-700 font-medium">🟠 {highCount} high task{highCount === 1 ? "" : "s"}</span>
            <span className="px-2 py-1 rounded-lg bg-zinc-100 text-zinc-600 font-medium">⚠ {roles.length} blocked posting{roles.length === 1 ? "" : "s"}</span>
          </div>

          {nothing && (
            <div className="text-center py-16 text-zinc-400">Nothing urgent right now — all clear. 🎉</div>
          )}

          {/* Urgent tasks */}
          {tasks.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-zinc-500 mb-2">Urgent tasks</h2>
              <div className="space-y-2">
                {tasks.map((t) => {
                  const u = urg(t.urgency);
                  const overdue = t.deadline && new Date(t.deadline) < today;
                  return (
                    <Link key={t.id} href={`/clients/${t.client_id}`} className="block rounded-lg border-l-4 p-3 hover:shadow-sm transition" style={{ borderLeftColor: u.dot, backgroundColor: u.bg }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-sm text-zinc-900">{t.title}</div>
                          <div className="text-xs text-zinc-500 mt-0.5">🦷 {t.clientName} · 👤 {t.assigneeName}</div>
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
            </div>
          )}

          {/* Blocked postings */}
          {roles.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-zinc-500 mb-2">Blocked postings</h2>
              <div className="space-y-2">
                {roles.map((r) => (
                  <Link key={r.id} href={`/clients/${r.client_id}`} className="block rounded-lg border-l-4 p-3 hover:shadow-sm transition" style={{ borderLeftColor: "#dc2626", backgroundColor: "#fef2f2" }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-zinc-900">{r.title}</div>
                        <div className="text-xs text-zinc-500 mt-0.5">🦷 {r.clientName} · 👤 {r.ownerName}</div>
                        {r.blocker_note && <div className="text-[11px] text-red-600 mt-1">⚠ {r.blocker_note}</div>}
                      </div>
                      <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ backgroundColor: "#dc262622", color: "#dc2626" }}>Blocked</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}