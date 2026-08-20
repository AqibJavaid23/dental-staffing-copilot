"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";

type Item = {
  id: string;
  content: string;
  done: boolean;
  deadline: string | null;
  priority: string;
  report_id: string;
};

const PRIORITY = {
  low: { label: "Low", dot: "#059669" },
  mid: { label: "Mid", dot: "#d97706" },
  high: { label: "High", dot: "#dc2626" },
};
const prio = (p: string) => PRIORITY[p as keyof typeof PRIORITY] || PRIORITY.mid;

function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function endOfToday() { const d = new Date(); d.setHours(23, 59, 59, 999); return d; }

export default function MyWeek({ userId }: { userId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // My approved (or completed) reports
      const { data: reports } = await supabase
        .from("reports")
        .select("id")
        .eq("owner_id", userId)
        .in("status", ["approved", "completed"]);
      const reportIds = (reports ?? []).map((r) => r.id);
      if (reportIds.length === 0) { setItems([]); setLoading(false); return; }

      const { data: its } = await supabase
        .from("report_items")
        .select("*")
        .in("report_id", reportIds);
      setItems((its ?? []) as Item[]);
      setLoading(false);
    })();
  }, [userId]);

  const today0 = startOfToday();
  const today1 = endOfToday();

  const notDone = items.filter((i) => !i.done);
  const overdue = notDone.filter((i) => i.deadline && new Date(i.deadline) < today0);
  const dueToday = notDone.filter((i) => i.deadline && new Date(i.deadline) >= today0 && new Date(i.deadline) <= today1);
  const upcoming = notDone.filter((i) => i.deadline && new Date(i.deadline) > today1);
  const noDate = notDone.filter((i) => !i.deadline);
  const completed = items.filter((i) => i.done);

  const stats = [
    { label: "Overdue", count: overdue.length, color: "#dc2626", bg: "#fef2f2" },
    { label: "Due Today", count: dueToday.length, color: "#d97706", bg: "#fffbeb" },
    { label: "Upcoming", count: upcoming.length, color: "#0080D0", bg: "#eff6ff" },
    { label: "Completed", count: completed.length, color: "#059669", bg: "#ecfdf5" },
  ];

  if (loading) return null; // don't block the dashboard while loading

  // If the user has no tasks at all, show a gentle prompt
  if (items.length === 0) {
    return (
      <div className="mb-10 bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
        <h3 className="font-semibold text-zinc-900 mb-1">My Week</h3>
        <p className="text-sm text-zinc-500">No approved tasks yet. <Link href="/dashboard/reports" className="text-blue-600 hover:underline">Submit a weekly plan</Link> to get started.</p>
      </div>
    );
  }

  const TaskRow = ({ it }: { it: Item }) => {
    const p = prio(it.priority);
    return (
      <Link href={`/dashboard/reports/${it.report_id}`} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-50 transition">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.dot }} />
        <span className="text-sm text-zinc-800 flex-1 min-w-0 truncate">{it.content}</span>
        {it.deadline && <span className="text-xs text-zinc-400 shrink-0">{new Date(it.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
      </Link>
    );
  };

  return (
    <div className="mb-10">
      <h3 className="text-xl font-semibold mb-4" style={{ color: "var(--deep-navy)" }}>My Week</h3>

      {/* Stat chips */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl p-4 border border-zinc-200" style={{ backgroundColor: s.bg }}>
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.count}</div>
            <div className="text-xs font-medium text-zinc-600 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Task lists (only show non-empty buckets) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {overdue.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-4">
            <h4 className="text-sm font-semibold text-red-600 mb-2">Overdue ({overdue.length})</h4>
            <div className="space-y-0.5">{overdue.map((it) => <TaskRow key={it.id} it={it} />)}</div>
          </div>
        )}
        {dueToday.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-4">
            <h4 className="text-sm font-semibold text-amber-600 mb-2">Due Today ({dueToday.length})</h4>
            <div className="space-y-0.5">{dueToday.map((it) => <TaskRow key={it.id} it={it} />)}</div>
          </div>
        )}
        {upcoming.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-4">
            <h4 className="text-sm font-semibold text-blue-600 mb-2">Upcoming ({upcoming.length})</h4>
            <div className="space-y-0.5">{upcoming.map((it) => <TaskRow key={it.id} it={it} />)}</div>
          </div>
        )}
        {noDate.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-4">
            <h4 className="text-sm font-semibold text-zinc-500 mb-2">No deadline ({noDate.length})</h4>
            <div className="space-y-0.5">{noDate.map((it) => <TaskRow key={it.id} it={it} />)}</div>
          </div>
        )}
      </div>
    </div>
  );
}