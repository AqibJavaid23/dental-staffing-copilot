"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";

type Profile = { id: string; role: string };
type Task = {
  id: string;
  content: string;
  done: boolean;
  deadline: string | null;
  priority: string;
  status: string;
  report_id: string;
  ownerName?: string;
};

const PRIORITY = {
  low: { color: "#059669" },
  mid: { color: "#d97706" },
  high: { color: "#dc2626" },
};
const prio = (p: string) => PRIORITY[p as keyof typeof PRIORITY] || PRIORITY.mid;

function startOfToday() { const d = new Date(); d.setHours(0,0,0,0); return d; }

export default function TaskPanel({ profile }: { profile: Profile }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "overdue" | "done">("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Which owners' reports can I see?
        let ownerIds: string[] = [profile.id];
        if (profile.role === "admin") {
          const { data: all } = await supabase.from("profiles").select("id");
          ownerIds = (all ?? []).map((p) => p.id);
        } else if (profile.role === "manager") {
          const { data: myGroups } = await supabase.from("group_members").select("group_id").eq("user_id", profile.id).eq("role_in_group", "manager");
          const groupIds = (myGroups ?? []).map((g) => g.group_id);
          let memberIds: string[] = [];
          if (groupIds.length > 0) {
            const { data: mems } = await supabase.from("group_members").select("user_id").in("group_id", groupIds).eq("role_in_group", "member");
            memberIds = (mems ?? []).map((m) => m.user_id);
          }
          ownerIds = [profile.id, ...memberIds];
        }

        const { data: reports } = await supabase.from("reports").select("id, owner_id").in("owner_id", ownerIds).in("status", ["approved", "completed"]);
        const reportIds = (reports ?? []).map((r) => r.id);
        const ownerByReport: Record<string, string> = {};
        (reports ?? []).forEach((r) => { ownerByReport[r.id] = r.owner_id; });
        if (reportIds.length === 0) { setTasks([]); setLoading(false); return; }

        const { data: items } = await supabase.from("report_items").select("*").in("report_id", reportIds);

        // Names (for non-member roles)
        let nameById: Record<string, string> = {};
        if (profile.role !== "member") {
          const { data: profs } = await supabase.from("profiles").select("id, full_name, email");
          (profs ?? []).forEach((p) => { nameById[p.id] = p.full_name || p.email; });
        }

        const mapped: Task[] = (items ?? []).map((it) => ({
          id: it.id, content: it.content, done: it.done, deadline: it.deadline,
          priority: it.priority, status: it.status || "todo", report_id: it.report_id,
          ownerName: profile.role !== "member" ? nameById[ownerByReport[it.report_id]] : undefined,
        }));
        setTasks(mapped);
      } finally { setLoading(false); }
    })();
  }, [profile.id, profile.role]);

  const today = startOfToday();
  const isOverdue = (t: Task) => !t.done && t.deadline && new Date(t.deadline) < today;

  const counts = {
    all: tasks.length,
    pending: tasks.filter((t) => !t.done).length,
    overdue: tasks.filter(isOverdue).length,
    done: tasks.filter((t) => t.done).length,
  };

  const filtered = tasks.filter((t) => {
    if (filter === "pending") return !t.done;
    if (filter === "overdue") return isOverdue(t);
    if (filter === "done") return t.done;
    return true;
  }).sort((a, b) => {
    // overdue first, then by deadline
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
  });

  const TABS: { key: typeof filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "overdue", label: "Overdue" },
    { key: "done", label: "Done" },
  ];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 flex flex-col h-full">
      <div className="p-4 border-b border-zinc-100">
        <h3 className="font-semibold text-zinc-900 mb-3">Tasks</h3>
        <div className="flex gap-1 bg-zinc-100 rounded-lg p-1 text-xs">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setFilter(t.key)} className={`flex-1 px-2 py-1.5 rounded-md font-medium transition ${filter === t.key ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500"}`}>
              {t.label} <span className={filter === t.key ? "text-zinc-400" : "text-zinc-400"}>{counts[t.key]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pretty-scroll p-2 max-h-[60vh]">
        {loading ? (
          <p className="text-sm text-zinc-400 p-4 text-center">Loading tasks...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-zinc-400 p-4 text-center">
            {tasks.length === 0 ? <>No tasks yet. <Link href="/dashboard/reports" className="text-blue-600 hover:underline">Create a plan</Link>.</> : "Nothing here."}
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((t) => {
              const p = prio(t.priority);
              const overdue = isOverdue(t);
              // Row color by state
              const rowStyle = t.done
                ? { border: "#e4e4e7", bg: "#fafafa", accent: "#a1a1aa" }
                : overdue
                ? { border: "#fecaca", bg: "#fef2f2", accent: "#dc2626" }
                : t.priority === "high"
                ? { border: "#fed7aa", bg: "#fff7ed", accent: "#ea580c" }
                : { border: "#e0e7ff", bg: "#ffffff", accent: p.color };
              return (
                <Link
                  key={t.id}
                  href={`/dashboard/reports/${t.report_id}`}
                  className="flex items-start gap-2 px-3 py-2 rounded-lg transition hover:shadow-sm border-l-4"
                  style={{ borderLeftColor: rowStyle.accent, backgroundColor: rowStyle.bg, borderTop: `1px solid ${rowStyle.border}`, borderRight: `1px solid ${rowStyle.border}`, borderBottom: `1px solid ${rowStyle.border}` }}
                >
                  <span className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: t.done ? "#d4d4d8" : rowStyle.accent }} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm truncate ${t.done ? "line-through text-zinc-400" : "text-zinc-800 font-medium"}`}>{t.content}</div>
                    <div className="flex items-center gap-2 text-[11px] mt-0.5">
                      {t.deadline && <span className={overdue ? "font-semibold" : "text-zinc-400"} style={overdue ? { color: "#dc2626" } : {}}>{overdue ? "⚠ Overdue · " : "📅 "}{new Date(t.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ backgroundColor: rowStyle.accent + "1A", color: rowStyle.accent }}>
                        {t.done ? "Done" : overdue ? "Overdue" : t.priority === "high" ? "High" : t.priority === "mid" ? "Mid" : "Low"}
                      </span>
                      {t.ownerName && <span className="text-zinc-400">· {t.ownerName}</span>}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}