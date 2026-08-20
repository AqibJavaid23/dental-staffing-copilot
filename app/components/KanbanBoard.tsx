"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";

type Card = {
  id: string;
  content: string;
  priority: string;
  deadline: string | null;
  status: string;
  report_id: string;
  ownerName?: string;
};

type Profile = { id: string; role: string };

const COLUMNS = [
  { key: "todo", label: "To Do", color: "#71717a" },
  { key: "in_progress", label: "In Progress", color: "#0080D0" },
  { key: "review", label: "Review", color: "#d97706" },
  { key: "done", label: "Completed", color: "#059669" },
];

const PRIORITY = {
  low: { label: "Low", color: "#059669" },
  mid: { label: "Mid", color: "#d97706" },
  high: { label: "High", color: "#dc2626" },
};
const prio = (p: string) => PRIORITY[p as keyof typeof PRIORITY] || PRIORITY.mid;

export default function KanbanBoard({ profile }: { profile: Profile }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<"mine" | "team">("mine");
  const [dragId, setDragId] = useState<string | null>(null);

  const isManagerOrAdmin = profile.role === "manager" || profile.role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Determine which owners' reports to include
      let ownerIds: string[] = [profile.id];

      if (scope === "team" && isManagerOrAdmin) {
        if (profile.role === "admin") {
          const { data: all } = await supabase.from("profiles").select("id");
          ownerIds = (all ?? []).map((p) => p.id);
        } else {
          // manager: members in groups I manage
          const { data: myGroups } = await supabase.from("group_members").select("group_id").eq("user_id", profile.id).eq("role_in_group", "manager");
          const groupIds = (myGroups ?? []).map((g) => g.group_id);
          let memberIds: string[] = [];
          if (groupIds.length > 0) {
            const { data: mems } = await supabase.from("group_members").select("user_id").in("group_id", groupIds).eq("role_in_group", "member");
            memberIds = (mems ?? []).map((m) => m.user_id);
          }
          ownerIds = [profile.id, ...memberIds];
        }
      }

      // Approved/completed reports for those owners
      const { data: reports } = await supabase.from("reports").select("id, owner_id").in("owner_id", ownerIds).in("status", ["approved", "completed"]);
      const reportIds = (reports ?? []).map((r) => r.id);
      const ownerByReport: Record<string, string> = {};
      (reports ?? []).forEach((r) => { ownerByReport[r.id] = r.owner_id; });

      if (reportIds.length === 0) { setCards([]); setLoading(false); return; }

      const { data: items } = await supabase.from("report_items").select("*").in("report_id", reportIds);

      // Owner names (for team view)
      let nameById: Record<string, string> = {};
      if (scope === "team") {
        const { data: profs } = await supabase.from("profiles").select("id, full_name, email");
        (profs ?? []).forEach((p) => { nameById[p.id] = p.full_name || p.email; });
      }

      const mapped: Card[] = (items ?? []).map((it) => ({
        id: it.id, content: it.content, priority: it.priority, deadline: it.deadline,
        status: it.status || "todo", report_id: it.report_id,
        ownerName: scope === "team" ? nameById[ownerByReport[it.report_id]] : undefined,
      }));
      setCards(mapped);
    } finally { setLoading(false); }
  }, [profile.id, profile.role, scope, isManagerOrAdmin]);

  useEffect(() => { load(); }, [load]);

  const moveCard = async (cardId: string, newStatus: string) => {
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.status === newStatus) return;
    // Optimistic update
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, status: newStatus } : c)));
    // Keep done in sync with status
    const done = newStatus === "done";
    await supabase.from("report_items").update({ status: newStatus, done }).eq("id", cardId);
  };

  const onDrop = (e: React.DragEvent, colKey: string) => {
    e.preventDefault();
    if (dragId) moveCard(dragId, colKey);
    setDragId(null);
  };

  if (loading) return <div className="py-12 text-center text-zinc-400 text-sm">Loading board...</div>;

  return (
    <div>
      {/* Scope toggle */}
      {isManagerOrAdmin && (
        <div className="flex gap-1 mb-4 bg-zinc-100 rounded-lg p-1 w-fit">
          <button onClick={() => setScope("mine")} className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${scope === "mine" ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500"}`}>My Tasks</button>
          <button onClick={() => setScope("team")} className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${scope === "team" ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500"}`}>Team Tasks</button>
        </div>
      )}

      {cards.length === 0 ? (
        <div className="py-12 text-center text-zinc-400 text-sm">No tasks to show. Approved report items appear here as cards.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {COLUMNS.map((col) => {
            const colCards = cards.filter((c) => c.status === col.key);
            return (
              <div
                key={col.key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDrop(e, col.key)}
                className="bg-zinc-50 rounded-2xl border border-zinc-200 p-3 min-h-[200px]"
              >
                <div className="flex items-center gap-2 mb-3 px-1">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
                  <h4 className="text-sm font-semibold text-zinc-700">{col.label}</h4>
                  <span className="text-xs text-zinc-400">{colCards.length}</span>
                </div>
                <div className="space-y-2">
                  {colCards.map((c) => {
                    const p = prio(c.priority);
                    return (
                      <div
                        key={c.id}
                        draggable
                        onDragStart={() => setDragId(c.id)}
                        onDragEnd={() => setDragId(null)}
                        className="bg-white rounded-xl border border-zinc-200 p-3 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition"
                      >
                        <div className="text-sm text-zinc-900 mb-2">{c.content}</div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: p.color + "1A", color: p.color }}>{p.label}</span>
                          {c.deadline && <span className="text-[11px] text-zinc-400">📅 {new Date(c.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                          {c.ownerName && <span className="text-[11px] text-zinc-500">· {c.ownerName}</span>}
                          <Link href={`/dashboard/reports/${c.report_id}`} className="text-[11px] text-blue-600 hover:underline ml-auto">open</Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}