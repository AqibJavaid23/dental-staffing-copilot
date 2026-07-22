"use client";

import { useEffect, useState, use, Fragment } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import { enrichRow, smartSearchRescue, enrichRowNppes, checkRowInputQuality, type EnrichmentRecord } from "@/app/lib/enrich";
import BrandLoader from "@/app/components/BrandLoader";
import { useAuth } from "@/app/lib/useAuth";
type PipelineRow = {
  id: string;
  license_number: string;
  row_data: Record<string, string>;
  enrichment_status: string;
  outreach_status: string;
  outreach_notes: string | null;
};

type Pipeline = { id: string; name: string; source_tab: string; project: string; created_at: string };

type LogEntry = {
  id: string;
  pipeline_row_id: string;
  status: string | null;
  note: string | null;
  created_at: string;
};

const STATUS_STYLE: Record<string, { label: string; classes: string }> = {
  enriched: { label: "✓ Enriched", classes: "bg-emerald-50 text-emerald-700" },
  partial: { label: "⚠ Partial", classes: "bg-amber-50 text-amber-700" },
  no_match: { label: "✕ No match", classes: "bg-red-50 text-red-700" },
  error: { label: "! Error", classes: "bg-red-50 text-red-700" },
  pending: { label: "Pending", classes: "bg-zinc-100 text-zinc-600" },
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

export default function PipelineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [rows, setRows] = useState<PipelineRow[]>([]);
  const [enrichments, setEnrichments] = useState<Record<string, EnrichmentRecord>>({});
  const [logs, setLogs] = useState<Record<string, LogEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyStage, setBusyStage] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmWeak, setConfirmWeak] = useState<{ row: PipelineRow; missing: string[] } | null>(null);

  // Log-entry dialog state
  const [logDialog, setLogDialog] = useState<{ row: PipelineRow; newStatus: string | null } | null>(null);
  const [logNote, setLogNote] = useState("");
  const [savingLog, setSavingLog] = useState(false);

  const { checking } = useAuth();

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const { data: p, error: pErr } = await supabase.from("pipelines").select("*").eq("id", id).single();
      if (pErr) throw pErr;
      setPipeline(p);

      const { data: r, error: rErr } = await supabase.from("pipeline_rows").select("*").eq("pipeline_id", id).order("created_at", { ascending: true });
      if (rErr) throw rErr;
      const rowList = r ?? [];
      setRows(rowList);

      const licenseNums = new Set(rowList.map((x) => (x.license_number || "").trim()).filter(Boolean));
      if (licenseNums.size > 0) {
        const { data: enr, error: enrErr } = await supabase.from("enrichments").select("*");
        if (enrErr) console.error("Enrichments fetch failed:", enrErr);
        const map: Record<string, EnrichmentRecord> = {};
        (enr ?? []).forEach((e) => {
          const key = (e.license_number || "").trim();
          if (licenseNums.has(key)) map[key] = e as EnrichmentRecord;
        });
        setEnrichments(map);
      }

      const rowIds = rowList.map((x) => x.id);
      if (rowIds.length > 0) {
        const { data: logData } = await supabase
          .from("outreach_log")
          .select("*")
          .in("pipeline_row_id", rowIds)
          .order("created_at", { ascending: false });
        const logMap: Record<string, LogEntry[]> = {};
        (logData ?? []).forEach((l) => {
          if (!logMap[l.pipeline_row_id]) logMap[l.pipeline_row_id] = [];
          logMap[l.pipeline_row_id].push(l as LogEntry);
        });
        setLogs(logMap);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pipeline");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const refreshEnrichmentsOnly = async () => {
    const licenseNums = new Set(rows.map((x) => (x.license_number || "").trim()).filter(Boolean));
    if (licenseNums.size === 0) return;
    const { data: enr, error: enrErr } = await supabase.from("enrichments").select("*");
    if (enrErr) console.error("Enrichments refresh failed:", enrErr);
    const map: Record<string, EnrichmentRecord> = {};
    (enr ?? []).forEach((e) => {
      const key = (e.license_number || "").trim();
      if (licenseNums.has(key)) map[key] = e as EnrichmentRecord;
    });
    setEnrichments(map);
  };

  const refreshLogsFor = async (rowId: string) => {
    const { data: logData } = await supabase
      .from("outreach_log")
      .select("*")
      .eq("pipeline_row_id", rowId)
      .order("created_at", { ascending: false });
    setLogs((prev) => ({ ...prev, [rowId]: (logData ?? []) as LogEntry[] }));
  };

  // ---- CRM: status change opens the log dialog ----
  const onStatusChange = (row: PipelineRow, newStatus: string) => {
    setLogNote("");
    setLogDialog({ row, newStatus });
  };

  // "+ Log" button: note without status change
  const openLogOnly = (row: PipelineRow) => {
    setLogNote("");
    setLogDialog({ row, newStatus: null });
  };

  const saveLogEntry = async () => {
    if (!logDialog) return;
    const { row, newStatus } = logDialog;
    const note = logNote.trim() || null;
    if (!newStatus && !note) { setLogDialog(null); return; } // nothing to save
    setSavingLog(true);
    try {
      // 1. Insert the log entry
      const { error: lErr } = await supabase.from("outreach_log").insert({
        pipeline_row_id: row.id,
        status: newStatus,
        note,
      });
      if (lErr) throw lErr;

      // 2. Update the row's current status if it changed
      if (newStatus) {
        const { error: uErr } = await supabase
          .from("pipeline_rows")
          .update({ outreach_status: newStatus, outreach_updated_at: new Date().toISOString() })
          .eq("id", row.id);
        if (uErr) throw uErr;
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, outreach_status: newStatus } : r)));
      }

      await refreshLogsFor(row.id);
      setExpandedId(row.id); // show the history
      setLogDialog(null);
    } catch (e) {
      alert("Failed to save: " + (e instanceof Error ? e.message : "unknown"));
    } finally { setSavingLog(false); }
  };

  // ---- Enrichment (with candidate-row fix: pass stored license_number into row data) ----
  const enrichableData = (row: PipelineRow) => ({ ...row.row_data, "License Number": row.license_number });

  const actuallyEnrich = async (row: PipelineRow) => {
    setBusyId(row.id);
    setBusyStage("Starting...");
    try {
      const existing = enrichments[(row.license_number || "").trim()];
      const forceRefresh = !!(existing && existing.matched_title);
      const result = await enrichRow(enrichableData(row), { forceRefresh, onProgress: (stage) => setBusyStage(stage) });
      await supabase.from("pipeline_rows").update({ enrichment_status: result.status }).eq("id", row.id);
      await refreshEnrichmentsOnly();
      setExpandedId(row.id);
    } catch (e) {
      alert("Enrichment failed: " + (e instanceof Error ? e.message : "unknown"));
      await refreshEnrichmentsOnly();
    } finally { setBusyId(null); setBusyStage(""); }
  };

  const runEnrich = (row: PipelineRow) => {
    const quality = checkRowInputQuality(enrichableData(row));
    if (!quality.ok || quality.hasWeakInput) { setConfirmWeak({ row, missing: quality.missing }); return; }
    actuallyEnrich(row);
  };

  const runNppes = async (row: PipelineRow) => {
    setBusyId(row.id);
    setBusyStage("Looking up NPPES registry...");
    try {
      await enrichRowNppes(enrichableData(row), { onProgress: (stage) => setBusyStage(stage) });
      await refreshEnrichmentsOnly();
      setExpandedId(row.id);
    } catch (e) {
      alert("NPPES lookup failed: " + (e instanceof Error ? e.message : "unknown"));
    } finally { setBusyId(null); setBusyStage(""); }
  };

  const runSmartSearch = async (row: PipelineRow) => {
    setBusyId(row.id);
    setBusyStage("Starting Smart Search...");
    try {
      const result = await smartSearchRescue(enrichableData(row), { onProgress: (stage) => setBusyStage(stage) });
      await supabase.from("pipeline_rows").update({ enrichment_status: result.status }).eq("id", row.id);
      await refreshEnrichmentsOnly();
      setExpandedId(row.id);
    } catch (e) {
      alert("Smart search failed: " + (e instanceof Error ? e.message : "unknown"));
      await refreshEnrichmentsOnly();
    } finally { setBusyId(null); setBusyStage(""); }
  };

  const removeRow = async (rowId: string) => {
    if (!confirm("Remove this row from the pipeline? Its outreach history will also be deleted.")) return;
    const { error } = await supabase.from("pipeline_rows").delete().eq("id", rowId);
    if (error) { alert("Remove failed: " + error.message); return; }
    load();
  };

  const statusCounts = OUTREACH_STATUSES.map((s) => ({
    ...s,
    count: rows.filter((r) => (r.outreach_status || "to_contact") === s.value).length,
  })).filter((s) => s.count > 0);
if (checking) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading..." /></div>;
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="flex justify-between items-center px-6 py-4 border-b border-zinc-200 bg-white">
        <Link href="/pipelines" className="text-sm text-zinc-500 hover:text-zinc-900 transition whitespace-nowrap">← Back to Pipelines</Link>
        <div className="flex-1 flex items-center justify-center gap-2 min-w-0 mx-4">
          {pipeline?.project && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{pipeline.project}</span>
          )}
          <h1 className="text-lg font-semibold text-zinc-900 truncate">{pipeline?.name ?? "Pipeline"}</h1>
        </div>
        <div className="w-32" />
      </header>

      <main className="flex-1 p-6">
        <div className="max-w-7xl mx-auto space-y-5">
          {!loading && rows.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {statusCounts.map((s) => (
                <span key={s.value} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200 rounded-full text-xs font-medium text-zinc-700 shadow-sm">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.label}: {s.count}
                </span>
              ))}
            </div>
          )}

          {error ? <div className="p-6 text-red-500 bg-red-50 rounded-lg">{error}</div>
          : loading ? <BrandLoader label="Loading pipeline..." />
          : rows.length === 0 ? <div className="p-12 text-center text-zinc-400">This pipeline is empty.</div>
          : (
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 border-b border-zinc-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-zinc-700 w-10"></th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-700">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-700">Business</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-700">City</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-700">Outreach Status</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-700">Last Activity</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-700">Data</th>
                    <th className="text-right px-4 py-3 font-medium text-zinc-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const d = r.row_data;
                    const enr = enrichments[(r.license_number || "").trim()];
                    const status = enr?.status || "pending";
                    const style = STATUS_STYLE[status] || STATUS_STYLE.pending;
                    const isBusy = busyId === r.id;
                    const isExpanded = expandedId === r.id;
                    const canSmartSearch = enr && (enr.status === "partial" || enr.status === "no_match" || enr.status === "error");
                    const rowLogs = logs[r.id] || [];
                    const hasAnyResult = !!(enr && (enr.status !== "pending" || enr.npi_status)) || rowLogs.length > 0;
                    const oStatus = statusMeta(r.outreach_status || "to_contact");
                    const lastLog = rowLogs[0];
                    return (
                      <Fragment key={r.id}>
                        <tr className={`border-b border-zinc-100 transition-colors ${isBusy ? "bg-blue-50/60" : ""}`}>
                          <td className="px-4 py-3 text-center">
                            {hasAnyResult && (
                              <button onClick={() => setExpandedId(isExpanded ? null : r.id)} className="text-zinc-400 hover:text-zinc-700">
                                {isExpanded ? "▾" : "▸"}
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3 text-zinc-900 whitespace-nowrap font-medium">
                            {[d["First Name"], d["Middle Name"], d["Last Name"]].filter(Boolean).join(" ")}
                          </td>
                          <td className="px-4 py-3 text-zinc-700">{d["Business Name"] || d["Office Name"] || "—"}</td>
                          <td className="px-4 py-3 text-zinc-700 whitespace-nowrap">{d["City"] || "—"}</td>
                          <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <select
                              value={r.outreach_status || "to_contact"}
                              onChange={(e) => onStatusChange(r, e.target.value)}
                              className="text-xs font-medium border rounded-lg px-2 py-1.5 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                              style={{ color: oStatus.color, borderColor: oStatus.color + "55" }}
                            >
                              {OUTREACH_STATUSES.map((s) => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3 max-w-[220px]">
                            {lastLog ? (
                              <button onClick={() => setExpandedId(isExpanded ? null : r.id)} className="text-left w-full">
                                <span className="block text-xs text-zinc-700 truncate" title={lastLog.note || ""}>{lastLog.note || statusMeta(lastLog.status || "").label}</span>
                                <span className="block text-[10px] text-zinc-400">{formatLogDate(lastLog.created_at)} · {rowLogs.length} entr{rowLogs.length === 1 ? "y" : "ies"}</span>
                              </button>
                            ) : (
                              <span className="text-xs italic text-zinc-400">No activity yet</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md ${style.classes}`}>{style.label}</span>
                            {enr?.npi_status === "verified" && <span className="ml-1 text-[10px] text-emerald-600">NPI✓</span>}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => openLogOnly(r)} disabled={isBusy} className="px-3 py-1 text-xs font-medium border border-zinc-300 text-zinc-700 rounded-md hover:bg-zinc-50 transition disabled:opacity-40" title="Add a note to the outreach history">
                                + Log
                              </button>
                              <button onClick={() => runNppes(r)} disabled={isBusy} className="px-3 py-1 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition disabled:opacity-60 disabled:cursor-not-allowed" title="Free official registry lookup">
                                {isBusy ? "..." : enr?.npi_status ? "NPPES ↻" : "NPPES"}
                              </button>
                              <button onClick={() => runEnrich(r)} disabled={isBusy} className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed min-w-[80px]" title="Google Maps + website scrape">
                                {isBusy ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="inline-block w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                                    Working
                                  </span>
                                ) : (enr?.status && enr.status !== "pending") ? "G-Maps ↻" : "G-Maps"}
                              </button>
                              {canSmartSearch && (
                                <button onClick={() => runSmartSearch(r)} disabled={isBusy} className="px-3 py-1 text-xs font-medium bg-amber-500 text-white rounded-md hover:bg-amber-600 transition disabled:opacity-40 disabled:cursor-not-allowed" title="Rescue with Google Search">🔍</button>
                              )}
                              <button onClick={() => removeRow(r.id)} className="px-2 py-1 text-xs text-zinc-500 hover:text-red-500 transition">✕</button>
                            </div>
                          </td>
                        </tr>

                        {isBusy && (
                          <tr className="bg-blue-50/60 border-b border-zinc-100">
                            <td colSpan={8} className="px-6 py-2 text-xs text-blue-700">
                              <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse mr-2 align-middle" />
                              {busyStage || "Working..."}
                            </td>
                          </tr>
                        )}

                        {!isBusy && enr?.status === "error" && enr.error_message && (
                          <tr className="bg-red-50/40 border-b border-zinc-100">
                            <td colSpan={8} className="px-6 py-2 text-xs text-red-700">⚠️ {enr.error_message}</td>
                          </tr>
                        )}

                        {!isBusy && enr?.status === "no_match" && (
                          <tr className="bg-red-50/40 border-b border-zinc-100">
                            <td colSpan={8} className="px-6 py-2 text-xs text-red-700">⚠️ No match found on Google Maps. Try NPPES or 🔍 Smart Search.</td>
                          </tr>
                        )}

                        {isExpanded && (
                          <tr className="bg-zinc-50/50">
                            <td colSpan={8} className="px-6 py-4">
                              <div className="grid grid-cols-4 gap-6 text-sm">
                                {/* Outreach History */}
                                <div>
                                  <h4 className="font-semibold text-zinc-900 mb-2">Outreach History</h4>
                                  {rowLogs.length > 0 ? (
                                    <ol className="space-y-2 max-h-64 overflow-y-auto pr-2">
                                      {rowLogs.map((l) => {
                                        const meta = l.status ? statusMeta(l.status) : null;
                                        return (
                                          <li key={l.id} className="text-xs border-l-2 pl-2" style={{ borderColor: meta?.color || "#d4d4d8" }}>
                                            <div className="flex items-center gap-1.5">
                                              {meta && <span className="font-semibold" style={{ color: meta.color }}>{meta.label}</span>}
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
                                </div>

                                {/* NPPES */}
                                <div>
                                  <h4 className="font-semibold text-zinc-900 mb-2">From NPPES Registry</h4>
                                  {enr?.npi_status ? (
                                    <dl className="space-y-1 text-xs">
                                      <div>
                                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                          enr.npi_status === "verified" ? "bg-emerald-100 text-emerald-700"
                                          : enr.npi_status === "probable" ? "bg-amber-100 text-amber-700"
                                          : "bg-zinc-100 text-zinc-600"
                                        }`}>
                                          {enr.npi_status === "verified" ? "✓ License verified" : enr.npi_status === "probable" ? "~ Probable match" : enr.npi_status === "no_match" ? "✕ Not found" : "? Unverified"}
                                        </span>
                                      </div>
                                      {enr.npi_name && <div><dt className="inline text-zinc-500">Name: </dt><dd className="inline text-zinc-900">{enr.npi_name}</dd></div>}
                                      {enr.npi_number && <div><dt className="inline text-zinc-500">NPI #: </dt><dd className="inline text-zinc-900 font-mono">{enr.npi_number}</dd></div>}
                                      {enr.npi_specialty && <div><dt className="inline text-zinc-500">Specialty: </dt><dd className="inline text-zinc-900">{enr.npi_specialty}</dd></div>}
                                      {enr.npi_address && <div><dt className="inline text-zinc-500">Practice: </dt><dd className="inline text-zinc-900">{enr.npi_address}</dd></div>}
                                      {enr.npi_phone && <div><dt className="inline text-zinc-500">Phone: </dt><dd className="inline text-zinc-900">{enr.npi_phone}</dd></div>}
                                    </dl>
                                  ) : (
                                    <p className="text-xs text-zinc-400 italic">Not looked up yet. Click NPPES.</p>
                                  )}
                                </div>

                                {/* Google Maps */}
                                <div>
                                  <h4 className="font-semibold text-zinc-900 mb-2">From Google Maps</h4>
                                  {enr?.matched_title ? (
                                    <dl className="space-y-1 text-xs">
                                      <div><dt className="inline text-zinc-500">Match: </dt><dd className="inline text-zinc-900">{enr.matched_title}</dd></div>
                                      {enr.street && <div><dt className="inline text-zinc-500">Address: </dt><dd className="inline text-zinc-900">{enr.street}, {enr.city}, {enr.state}</dd></div>}
                                      {enr.phone && <div><dt className="inline text-zinc-500">Phone: </dt><dd className="inline text-zinc-900">{enr.phone}</dd></div>}
                                      {enr.website && <div><dt className="inline text-zinc-500">Website: </dt><dd className="inline"><a href={enr.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{enr.website}</a></dd></div>}
                                      {enr.google_maps_url && <div><a href={enr.google_maps_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">Verify on Google Maps →</a></div>}
                                    </dl>
                                  ) : (
                                    <p className="text-xs text-zinc-400 italic">Not searched yet. Click G-Maps.</p>
                                  )}
                                </div>

                                {/* Website Scrape */}
                                <div>
                                  <h4 className="font-semibold text-zinc-900 mb-2">From Website Scrape</h4>
                                  <dl className="space-y-1 text-xs">
                                    {enr?.emails && enr.emails.length > 0 && (
                                      <div><dt className="text-zinc-500 mb-1">Emails:</dt>
                                        {enr.emails.map((em, i) => <dd key={i} className="text-zinc-900 font-mono break-all">{em}</dd>)}
                                      </div>
                                    )}
                                    {enr?.extra_phones && enr.extra_phones.length > 0 && (
                                      <div><dt className="text-zinc-500 mb-1">Additional phones:</dt>
                                        {enr.extra_phones.map((p, i) => <dd key={i} className="text-zinc-900">{p}</dd>)}
                                      </div>
                                    )}
                                    {enr?.facebooks && enr.facebooks.length > 0 && <div><dt className="inline text-zinc-500">Facebook: </dt>{enr.facebooks.map((u, i) => <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">link</a>)}</div>}
                                    {enr?.instagrams && enr.instagrams.length > 0 && <div><dt className="inline text-zinc-500">Instagram: </dt>{enr.instagrams.map((u, i) => <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">link</a>)}</div>}
                                    {(!enr?.emails || enr.emails.length === 0) && (!enr?.extra_phones || enr.extra_phones.length === 0) && (
                                      <p className="text-zinc-400 italic">No contact details from website yet.</p>
                                    )}
                                  </dl>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Log entry dialog (status change or +Log) */}
      {logDialog && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={() => !savingLog && setLogDialog(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-zinc-900">
              {logDialog.newStatus
                ? <>Update status → <span style={{ color: statusMeta(logDialog.newStatus).color }}>{statusMeta(logDialog.newStatus).label}</span></>
                : "Add outreach note"}
            </h2>
            <p className="text-sm text-zinc-500">
              {[logDialog.row.row_data["First Name"], logDialog.row.row_data["Last Name"]].filter(Boolean).join(" ")}
              {" — "}this will be saved to the outreach history.
            </p>
            <textarea
              value={logNote}
              onChange={(e) => setLogNote(e.target.value)}
              autoFocus
              rows={3}
              placeholder={logDialog.newStatus ? "Optional note — e.g., spoke with office manager, call back Tuesday" : "e.g., left voicemail again"}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setLogDialog(null)} disabled={savingLog} className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900 transition disabled:opacity-40">Cancel</button>
              <button onClick={saveLogEntry} disabled={savingLog || (!logDialog.newStatus && !logNote.trim())} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed">
                {savingLog ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmWeak && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={() => setConfirmWeak(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-zinc-900">Limited info to search with</h2>
            <p className="text-sm text-zinc-500">
              This row is missing: <strong>{confirmWeak.missing.join(", ")}</strong>. Enrichment may return no results or the wrong person.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setConfirmWeak(null)} className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900 transition">Cancel</button>
              <button onClick={() => { const r = confirmWeak.row; setConfirmWeak(null); actuallyEnrich(r); }} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">Enrich anyway</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}