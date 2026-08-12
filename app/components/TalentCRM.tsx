"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/app/lib/supabase";

/**
 * Self-contained CRM block (outreach status + log + shared history) for a single person.
 * Keyed to `pipelineRowId` so the log is the SAME history shown in the pipeline
 * (both read/write the outreach_log table by pipeline_row_id, and the status
 * lives on the pipeline_rows row itself).
 *
 * Use it anywhere you have a person's pipeline_row_id (e.g. the pool's expanded talent).
 */

type LogEntry = {
  id: string;
  pipeline_row_id: string;
  status: string | null;
  note: string | null;
  created_at: string;
};

const OUTREACH_STATUSES: { value: string; label: string; color: string }[] = [
  { value: "to_contact", label: "To Contact", color: "#71717a" },
  { value: "contacted", label: "Contacted", color: "#0080D0" },
  { value: "in_conversation", label: "In Conversation", color: "#7c3aed" },
  { value: "interested", label: "Interested", color: "#059669" },
  { value: "meeting_scheduled", label: "Meeting Scheduled", color: "#d97706" },
  { value: "placed", label: "Placed ✓", color: "#123B78" },
  { value: "not_interested", label: "Not Interested", color: "#dc2626" },
  { value: "no_response", label: "No Response", color: "#9ca3af" },
];
const statusMeta = (value: string) => OUTREACH_STATUSES.find((s) => s.value === value) || OUTREACH_STATUSES[0];

function formatLogDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function TalentCRM({ pipelineRowId }: { pipelineRowId: string }) {
  const [status, setStatus] = useState<string>("to_contact");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialog, setDialog] = useState<{ newStatus: string | null } | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!pipelineRowId) { setLoading(false); return; }
    setLoading(true);
    // Current status from the pipeline row
    const { data: row } = await supabase.from("pipeline_rows").select("outreach_status").eq("id", pipelineRowId).maybeSingle();
    if (row) setStatus(row.outreach_status || "to_contact");
    // Shared log history
    const { data: logData } = await supabase
      .from("outreach_log")
      .select("*")
      .eq("pipeline_row_id", pipelineRowId)
      .order("created_at", { ascending: false });
    setLogs((logData ?? []) as LogEntry[]);
    setLoading(false);
  }, [pipelineRowId]);

  useEffect(() => { load(); }, [load]);

  const onStatusChange = (newStatus: string) => { setNote(""); setDialog({ newStatus }); };
  const openLogOnly = () => { setNote(""); setDialog({ newStatus: null }); };

  const saveEntry = async () => {
    if (!dialog) return;
    const { newStatus } = dialog;
    const trimmed = note.trim() || null;
    if (!newStatus && !trimmed) { setDialog(null); return; }
    setSaving(true);
    try {
      const { error: lErr } = await supabase.from("outreach_log").insert({
        pipeline_row_id: pipelineRowId,
        status: newStatus,
        note: trimmed,
      });
      if (lErr) throw lErr;
      if (newStatus) {
        await supabase.from("pipeline_rows")
          .update({ outreach_status: newStatus, outreach_updated_at: new Date().toISOString() })
          .eq("id", pipelineRowId);
        setStatus(newStatus);
      }
      await load();
      setDialog(null);
    } catch (e) {
      alert("Failed to save: " + (e instanceof Error ? e.message : "unknown"));
    } finally { setSaving(false); }
  };

  const meta = statusMeta(status);

  return (
    <div className="border-t border-zinc-200 pt-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-zinc-900 text-sm">Outreach</h4>
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
            className="text-xs font-medium border rounded-lg px-2 py-1.5 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{ color: meta.color, borderColor: meta.color + "55" }}
          >
            {OUTREACH_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button onClick={openLogOnly} className="px-3 py-1 text-xs font-medium border border-zinc-300 text-zinc-700 rounded-md hover:bg-zinc-50 transition">+ Log</button>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-zinc-400">Loading history...</p>
      ) : logs.length > 0 ? (
        <ol className="space-y-2 max-h-48 overflow-y-auto pr-2">
          {logs.map((l) => {
            const m = l.status ? statusMeta(l.status) : null;
            return (
              <li key={l.id} className="text-xs border-l-2 pl-2" style={{ borderColor: m?.color || "#d4d4d8" }}>
                <div className="flex items-center gap-1.5">
                  {m && <span className="font-semibold" style={{ color: m.color }}>{m.label}</span>}
                  <span className="text-zinc-400">{formatLogDate(l.created_at)}</span>
                </div>
                {l.note && <p className="text-zinc-700 mt-0.5">{l.note}</p>}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-xs text-zinc-400 italic">No activity logged yet. Use + Log or change the status.</p>
      )}

      {dialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !saving && setDialog(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-zinc-900">
              {dialog.newStatus
                ? <>Update status → <span style={{ color: statusMeta(dialog.newStatus).color }}>{statusMeta(dialog.newStatus).label}</span></>
                : "Add outreach note"}
            </h2>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoFocus
              rows={3}
              placeholder={dialog.newStatus ? "Optional note — e.g., spoke with them, call back Tuesday" : "e.g., left a voicemail"}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setDialog(null)} disabled={saving} className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900 transition disabled:opacity-40">Cancel</button>
              <button onClick={saveEntry} disabled={saving || (!dialog.newStatus && !note.trim())} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed">
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
