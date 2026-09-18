"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/app/lib/supabase";

type Me = { id: string; full_name: string | null; email: string } | null;
type Log = {
  id: string; client_id: string; call_date: string | null; call_type: string;
  attendees: string | null; note: string | null; logged_by_name: string | null; created_at: string;
};

const TYPES: Record<string, { label: string; color: string; bg: string }> = {
  coaching: { label: "Coaching call", color: "#0d9488", bg: "#ccfbf1" },
  check_in: { label: "Check-in", color: "#2563eb", bg: "#dbeafe" },
  other: { label: "Other", color: "#6b7280", bg: "#f4f4f5" },
};
const typeOf = (t: string) => TYPES[t] || TYPES.other;

export default function CallLog({
  clientId, clientName, me, embedded = false,
}: {
  clientId: string; clientName: string; me: Me; embedded?: boolean;
}) {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const blank = { call_date: today, call_type: "coaching", attendees: "", note: "" };
  const [form, setForm] = useState(blank);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("client_call_logs")
      .select("*")
      .eq("client_id", clientId)
      .order("call_date", { ascending: false })
      .order("created_at", { ascending: false });
    setLogs((data ?? []) as Log[]);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const logActivity = async (action: string, detail: string) => {
    if (!me) return;
    await supabase.from("client_activity").insert({
      client_id: clientId, task_id: null, actor_id: me.id,
      actor_name: me.full_name || me.email || "User", action, detail,
    });
  };

  const add = async () => {
    if (!form.note.trim() && !form.attendees.trim()) { alert("Add a note about the call first."); return; }
    const { error } = await supabase.from("client_call_logs").insert({
      client_id: clientId,
      call_date: form.call_date || null,
      call_type: form.call_type,
      attendees: form.attendees.trim() || null,
      note: form.note.trim() || null,
      logged_by: me?.id || null,
      logged_by_name: me?.full_name || me?.email || "User",
    });
    if (error) { alert("Failed: " + error.message); return; }
    await logActivity("call_logged", `logged a ${typeOf(form.call_type).label.toLowerCase()} on ${form.call_date}`);
    setForm(blank);
    setShowAdd(false);
    load();
  };

  const remove = async (l: Log) => {
    if (!confirm("Delete this call log entry?")) return;
    await supabase.from("client_call_logs").delete().eq("id", l.id);
    setLogs((prev) => prev.filter((x) => x.id !== l.id));
  };

  const fmt = (d: string | null) =>
    d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

  return (
    <div className={embedded ? "border-t border-zinc-200 pt-4 mt-4" : "bg-white rounded-2xl shadow-sm border border-zinc-200 p-6"}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-zinc-900">📞 Call Log</h3>
        <button onClick={() => setShowAdd((s) => !s)} className="text-sm font-medium text-teal-600 hover:text-teal-700 transition">{showAdd ? "Cancel" : "+ Add entry"}</button>
      </div>
      <p className="text-xs text-zinc-400 mb-4">A dated record of every call with {clientName} — what happened, who was on it.</p>

      {showAdd && (
        <div className="border border-zinc-200 rounded-xl p-4 mb-4 bg-zinc-50/50 space-y-2">
          <div className="flex gap-2 flex-wrap">
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">Date</label>
              <input type="date" value={form.call_date} onChange={(e) => setForm({ ...form, call_date: e.target.value })} className="px-2 py-1.5 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">Type</label>
              <select value={form.call_type} onChange={(e) => setForm({ ...form, call_type: e.target.value })} className="px-2 py-1.5 border border-zinc-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                {Object.keys(TYPES).map((k) => <option key={k} value={k}>{TYPES[k].label}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="block text-[11px] text-zinc-500 mb-1">Who was on the call</label>
              <input type="text" value={form.attendees} onChange={(e) => setForm({ ...form, attendees: e.target.value })} placeholder="e.g. Dr. Smith, George, Zaid" className="w-full px-2 py-1.5 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-zinc-500 mb-1">What happened on this call</label>
            <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={3} placeholder="Key points, decisions, next steps..." className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <button onClick={add} className="px-4 py-2 text-sm font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition">Save entry</button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-400 italic">Loading call log...</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-zinc-400 italic">No calls logged yet. Click "+ Add entry" after your next call.</p>
      ) : (
        <div className="space-y-2">
          {logs.map((l) => {
            const t = typeOf(l.call_type);
            return (
              <div key={l.id} className="border border-zinc-200 rounded-xl p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-zinc-900">{fmt(l.call_date)}</span>
                    <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: t.bg, color: t.color }}>{t.label}</span>
                    {l.attendees && <span className="text-[11px] text-zinc-500">👥 {l.attendees}</span>}
                  </div>
                  <button onClick={() => remove(l)} className="text-[11px] text-zinc-400 hover:text-red-500 shrink-0">delete</button>
                </div>
                {l.note && <p className="text-sm text-zinc-600 mt-1.5 whitespace-pre-wrap">{l.note}</p>}
                <p className="text-[11px] text-zinc-400 mt-1.5">Logged by {l.logged_by_name || "—"}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}