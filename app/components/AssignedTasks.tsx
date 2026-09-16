"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";

type Task = {
  id: string; client_id: string; title: string; description: string | null;
  urgency: string; deadline: string | null; status: string; clientName?: string;
};

const URGENCY = {
  critical: { label: "Critical", dot: "#dc2626", bg: "#fef2f2", text: "#dc2626", emoji: "🔴" },
  high: { label: "High", dot: "#ea580c", bg: "#fff7ed", text: "#ea580c", emoji: "🟠" },
  medium: { label: "Medium", dot: "#d97706", bg: "#fffbeb", text: "#b45309", emoji: "🟡" },
  low: { label: "Low", dot: "#059669", bg: "#ecfdf5", text: "#059669", emoji: "🟢" },
};
const urg = (u: string) => URGENCY[u as keyof typeof URGENCY] || URGENCY.medium;

export default function AssignedTasks({ userId }: { userId: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    // Client tasks assigned to me across all clients
    const { data: ts } = await supabase
      .from("client_tasks")
      .select("id, client_id, title, description, urgency, deadline, status")
      .eq("assigned_to", userId)
      .order("created_at", { ascending: false });
    const list = (ts ?? []) as Task[];
    // client names
    const ids = [...new Set(list.map((t) => t.client_id))];
    const nameById: Record<string, string> = {};
    if (ids.length > 0) {
      const { data: cls } = await supabase.from("clients").select("id, name").in("id", ids);
      (cls ?? []).forEach((c) => { nameById[c.id] = c.name; });
    }
    setTasks(list.map((t) => ({ ...t, clientName: nameById[t.client_id] || "Unknown" })));
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const today = new Date(new Date().toDateString());
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  const open = tasks
    .filter((t) => t.status !== "completed")
    .sort((a, b) => (order[a.urgency as keyof typeof order] ?? 9) - (order[b.urgency as keyof typeof order] ?? 9));
  const done = tasks.filter((t) => t.status === "completed");
  const overdueCount = open.filter((t) => t.deadline && new Date(t.deadline) < today).length;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5 mt-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-zinc-900">📌 Assigned to me</h3>
        <span className="text-[11px] text-zinc-400">{open.length} open{overdueCount > 0 ? ` · ${overdueCount} overdue` : ""}</span>
      </div>
      <p className="text-xs text-zinc-400 mb-3">Tasks handed to you on client records.</p>

      {loading ? (
        <p className="text-sm text-zinc-400 italic">Loading...</p>
      ) : open.length === 0 && done.length === 0 ? (
        <p className="text-sm text-zinc-400 italic">Nothing assigned to you yet.</p>
      ) : (
        <>
          {open.length === 0 ? (
            <p className="text-sm text-zinc-400 italic">No open tasks assigned to you.</p>
          ) : (
            <div className="space-y-2">
              {open.map((t) => {
                const u = urg(t.urgency);
                const overdue = t.deadline && new Date(t.deadline) < today;
                return (
                  <Link key={t.id} href={`/clients/${t.client_id}`} className="block rounded-lg border-l-4 p-3 hover:shadow-sm transition" style={{ borderLeftColor: u.dot, backgroundColor: u.bg }}>
                    <div className="font-medium text-sm text-zinc-900">{t.title}</div>
                    {t.description && <div className="text-xs text-zinc-600 mt-0.5 line-clamp-2">{t.description}</div>}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[11px]">
                      <span className="font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: u.dot + "22", color: u.text }}>{u.emoji} {u.label}</span>
                      <span className="text-zinc-500">🦷 {t.clientName}</span>
                      {t.deadline && <span className={overdue ? "text-red-600 font-semibold" : "text-zinc-500"}>{overdue ? "⚠ " : "📅 "}{new Date(t.deadline).toLocaleDateString()}</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {done.length > 0 && (
            <div className="mt-3">
              <button onClick={() => setShowDone((s) => !s)} className="text-xs font-medium text-zinc-500 hover:text-zinc-800">
                {showDone ? "Hide" : "Show"} completed ({done.length})
              </button>
              {showDone && (
                <div className="space-y-1 mt-2">
                  {done.map((t) => (
                    <Link key={t.id} href={`/clients/${t.client_id}`} className="block text-xs px-2 py-1.5 rounded hover:bg-zinc-50">
                      <span className="line-through text-zinc-400">{t.title}</span>
                      <span className="text-zinc-400"> · {t.clientName}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}