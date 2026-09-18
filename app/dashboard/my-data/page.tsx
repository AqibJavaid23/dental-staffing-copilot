"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import BrandLoader from "@/app/components/BrandLoader";
import { findMyPipelineByName, createPipeline, mergeIntoPipeline } from "@/app/lib/savePipeline";
const ROW_LIMIT = 5000;
const PAGE_SIZE = 50;
const EXPECTED = ["Name", "EmailAddress", "Phone", "Location", "Status", "Email Campaign", "SMS campaign", "Remarks"];

type UploadRow = {
  id: string;
  owner_id: string;
  batch_id: string | null;
  batch_name: string | null;
  row_data: Record<string, string>;
  created_at: string;
};

type Batch = {
  batchId: string;
  name: string;
  ownerId: string;
  count: number;
  createdAt: string;
};

export default function MyDataPage() {
  const router = useRouter();
  const { profile, checking } = useAuth();
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  const [openBatchId, setOpenBatchId] = useState<string | null>(null); // null = batch list; else drill-in
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Record<string, UploadRow>>({});
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [pipelineName, setPipelineName] = useState("");
  const [saving, setSaving] = useState(false);
  const [dupePipelineId, setDupePipelineId] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true); setError(null);
    try {
      let query = supabase.from("user_uploads").select("*").order("created_at", { ascending: false });
      if (profile.role === "member") {
        query = query.eq("owner_id", profile.id);
      } else if (profile.role === "manager") {
        const { data: members } = await supabase.from("profiles").select("id").eq("role", "member");
        const ids = [profile.id, ...(members ?? []).map((m) => m.id)];
        query = query.in("owner_id", ids);
      }
      const { data, error: e } = await query;
      if (e) throw e;
      setRows((data ?? []) as UploadRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  }, [profile]);

  useEffect(() => { if (profile) load(); }, [profile, load]);

  const myRowCount = useMemo(
    () => (profile ? rows.filter((r) => r.owner_id === profile.id).length : 0),
    [rows, profile]
  );

  // Group rows into batches
  const batches = useMemo<Batch[]>(() => {
    const map = new Map<string, Batch>();
    for (const r of rows) {
      const key = r.batch_id || `legacy-${r.batch_name}-${r.owner_id}`;
      const existing = map.get(key);
      if (existing) {
        existing.count++;
      } else {
        map.set(key, {
          batchId: key,
          name: r.batch_name || "Untitled",
          ownerId: r.owner_id,
          count: 1,
          createdAt: r.created_at,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [rows]);

  const handleFile = async (file: File) => {
    if (!profile) return;
    setUploading(true); setUploadMsg(null);
    try {
      let parsed: Record<string, string>[] = [];
      if (file.name.toLowerCase().endsWith(".csv")) {
        const text = await file.text();
        parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true }).data;
      } else if (file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls")) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        parsed = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      } else {
        throw new Error("Please upload a .csv or .xlsx file");
      }
      parsed = parsed.filter((r) => (r["Name"] || r["EmailAddress"] || r["Phone"]));
      if (parsed.length === 0) throw new Error("No usable rows found. Check your column headers match the template (Name, EmailAddress, Phone, Location, ...).");
      if (myRowCount + parsed.length > ROW_LIMIT) {
        throw new Error(`This upload would exceed your ${ROW_LIMIT.toLocaleString()}-row limit. You have ${myRowCount.toLocaleString()} rows; this file has ${parsed.length.toLocaleString()}.`);
      }

      const batchId = crypto.randomUUID();
      const records = parsed.map((r) => ({ owner_id: profile.id, batch_id: batchId, batch_name: file.name, row_data: r }));
      for (let i = 0; i < records.length; i += 500) {
        const { error: insErr } = await supabase.from("user_uploads").insert(records.slice(i, i + 500));
        if (insErr) throw insErr;
      }
      setUploadMsg(`Uploaded ${parsed.length.toLocaleString()} rows from "${file.name}".`);
      load();
    } catch (e) {
      setUploadMsg(e instanceof Error ? e.message : "Upload failed");
    } finally { setUploading(false); }
  };

  const deleteBatch = async (batch: Batch) => {
    if (!profile) return;
    if (batch.ownerId !== profile.id) { alert("You can only delete your own uploads."); return; }
    if (!confirm(`Delete "${batch.name}" (${batch.count} rows)? This can't be undone.`)) return;
    try {
      // Delete by batch_id if present, else legacy fallback by name+owner
      if (batch.batchId.startsWith("legacy-")) {
        await supabase.from("user_uploads").delete().eq("owner_id", profile.id).eq("batch_name", batch.name).is("batch_id", null);
      } else {
        await supabase.from("user_uploads").delete().eq("batch_id", batch.batchId);
      }
      if (openBatchId === batch.batchId) setOpenBatchId(null);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  };

  // Rows for the currently opened batch
  const openBatch = batches.find((b) => b.batchId === openBatchId) || null;
  const batchRows = useMemo(() => {
    if (!openBatchId) return [];
    return rows.filter((r) => (r.batch_id || `legacy-${r.batch_name}-${r.owner_id}`) === openBatchId);
  }, [rows, openBatchId]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return batchRows;
    return batchRows.filter((r) => {
      const d = r.row_data;
      return `${d["Name"] ?? ""} ${d["EmailAddress"] ?? ""} ${d["Location"] ?? ""} ${d["Phone"] ?? ""}`.toLowerCase().includes(s);
    });
  }, [batchRows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
  useEffect(() => { setPage(1); }, [search, openBatchId]);

  const toggleRow = (r: UploadRow) => {
    setSelected((prev) => { const n = { ...prev }; if (n[r.id]) delete n[r.id]; else n[r.id] = r; return n; });
  };
  const selectedCount = Object.keys(selected).length;

 // Build the rows to save (shared by create + merge)
  // Map the outreach-list columns into the fields the pipeline enrichment expects
  const mapForPipeline = (d: Record<string, string>): Record<string, string> => {
    const out: Record<string, string> = { ...d };
    if (!out["First Name"] && !out["Last Name"] && out["Name"]) {
      const parts = out["Name"].trim().split(/\s+/);
      out["First Name"] = parts.shift() || "";
      out["Last Name"] = parts.join(" ");
    }
    if (!out["City"] && out["Location"]) {
      const [city, state] = out["Location"].split(",").map((x) => x.trim());
      out["City"] = city || "";
      if (state && !out["State"]) out["State"] = state;
    }
    if (!out["Email"] && out["EmailAddress"]) out["Email"] = out["EmailAddress"];
    return out;
  };

  const buildRows = () =>
    Object.values(selected).map((r) => ({
      license_number: (r.row_data["License Number"] || `UP::${r.id}`).trim(),
      row_data: mapForPipeline(r.row_data),
    }));

  const savePipeline = async () => {
    if (!profile || !pipelineName.trim()) return;
    setSaving(true);
    try {
      const existingId = await findMyPipelineByName(profile.id, pipelineName.trim());
      if (existingId) {
        // Name taken — ask the user what to do
        setDupePipelineId(existingId);
        setSaving(false);
        return;
      }
      await createPipeline(profile.id, pipelineName.trim(), "Upload", buildRows());
      setSelected({}); setShowSaveDialog(false); setPipelineName("");
      router.push("/pipelines");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save pipeline");
    } finally { setSaving(false); }
  };

  const doMerge = async () => {
    if (!profile || !dupePipelineId) return;
    setSaving(true);
    try {
      const res = await mergeIntoPipeline(dupePipelineId, buildRows());
      alert(res.status === "merged" ? `Added ${res.added} row(s), skipped ${res.skipped} already in the pipeline.` : "Merged.");
      setSelected({}); setShowSaveDialog(false); setPipelineName(""); setDupePipelineId(null);
      router.push("/pipelines");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Merge failed");
    } finally { setSaving(false); }
  };

  const doCreateNewName = () => {
    // Let the user pick a different name — just close the dupe dialog, keep the save dialog open
    setDupePipelineId(null);
  };
  if (checking) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading..." /></div>;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="flex justify-between items-center px-6 py-4 border-b border-zinc-200 bg-white">
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900 transition">← Back</Link>
        <h1 className="text-lg font-semibold text-zinc-900">My Data</h1>
        <Link href="/pipelines" className="text-sm text-blue-600 hover:underline">Pipelines →</Link>
      </header>

      <main className="flex-1 p-6 pb-32">
        <div className="max-w-7xl mx-auto space-y-5">
          {/* Upload box */}
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-zinc-900">Upload a list</h2>
              <span className="text-xs text-zinc-500">{myRowCount.toLocaleString()} / {ROW_LIMIT.toLocaleString()} rows used</span>
            </div>
            <p className="text-sm text-zinc-500">CSV or Excel with these columns: {EXPECTED.join(", ")}. (A serial-number / S.No column is ignored.)</p>
            <input type="file" accept=".csv,.xlsx,.xls" disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
              className="block text-sm text-zinc-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer" />
            {uploading && <p className="text-sm text-blue-600">Uploading…</p>}
            {uploadMsg && <p className="text-sm text-zinc-700">{uploadMsg}</p>}
          </div>

          {/* BATCH LIST view */}
          {!openBatchId && (
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
              {error ? <div className="p-8 text-center text-red-500">{error}</div>
              : loading ? <BrandLoader label="Loading your files..." />
              : batches.length === 0 ? <div className="p-12 text-center text-zinc-400">No uploads yet. Upload a CSV or Excel file above.</div>
              : (
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 border-b border-zinc-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700">File</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700">Rows</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700">Uploaded</th>
                      <th className="text-right px-4 py-3 font-medium text-zinc-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b) => {
                      const isMine = b.ownerId === profile?.id;
                      return (
                        <tr key={b.batchId} className="border-b border-zinc-100 hover:bg-zinc-50 transition">
                          <td className="px-4 py-3">
                            <button onClick={() => setOpenBatchId(b.batchId)} className="text-blue-600 hover:underline font-medium">📄 {b.name}</button>
                          </td>
                          <td className="px-4 py-3 text-zinc-700">{b.count.toLocaleString()}</td>
                          <td className="px-4 py-3 text-zinc-500 text-xs">{new Date(b.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => setOpenBatchId(b.batchId)} className="text-xs text-zinc-600 hover:text-zinc-900 mr-3">Open</button>
                            {isMine && <button onClick={() => deleteBatch(b)} className="text-xs text-zinc-500 hover:text-red-500 transition">Delete</button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* DRILL-IN: rows of one batch */}
          {openBatchId && openBatch && (
            <>
              <div className="flex items-center gap-3">
                <button onClick={() => { setOpenBatchId(null); setSearch(""); }} className="text-sm text-zinc-500 hover:text-zinc-900 transition">← All files</button>
                <span className="text-sm font-medium text-zinc-900">📄 {openBatch.name}</span>
                <span className="text-xs text-zinc-400">{openBatch.count.toLocaleString()} rows</span>
                <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="ml-auto px-3 py-1.5 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-56" />
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 border-b border-zinc-200">
                      <tr>
                        <th className="px-4 py-3 w-10"></th>
                        <th className="text-left px-4 py-3 font-medium text-zinc-700">Name</th>
                        <th className="text-left px-4 py-3 font-medium text-zinc-700">Email</th>
                        <th className="text-left px-4 py-3 font-medium text-zinc-700">Phone</th>
                        <th className="text-left px-4 py-3 font-medium text-zinc-700">Location</th>
                        <th className="text-left px-4 py-3 font-medium text-zinc-700">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paged.map((r) => {
                        const d = r.row_data;
                        const isSel = !!selected[r.id];
                        return (
                          <tr key={r.id} onClick={() => toggleRow(r)} className={`border-b border-zinc-100 cursor-pointer transition ${isSel ? "bg-blue-50/50" : ""}`}>
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <input type="checkbox" checked={isSel} onChange={() => toggleRow(r)} className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500" />
                            </td>
                            <td className="px-4 py-3 text-zinc-900 whitespace-nowrap font-medium">{d["Name"] || "—"}</td>
                            <td className="px-4 py-3 text-zinc-700 whitespace-nowrap">{d["EmailAddress"] || d["Email"] || "—"}</td>
                            <td className="px-4 py-3 text-zinc-700 whitespace-nowrap">{d["Phone"] || "—"}</td>
                            <td className="px-4 py-3 text-zinc-700 whitespace-nowrap">{d["Location"] || "—"}</td>
                            <td className="px-4 py-3 text-zinc-700 whitespace-nowrap">{d["Status"] || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {filtered.length > PAGE_SIZE && (
                <div className="flex items-center justify-between">
                  <div className="text-sm text-zinc-500">Page {page} of {totalPages}</div>
                  <div className="flex gap-2">
                    <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-sm border border-zinc-300 rounded-lg bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 transition">Previous</button>
                    <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 text-sm border border-zinc-300 rounded-lg bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 transition">Next</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {selectedCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 bg-zinc-900 text-white rounded-full shadow-2xl px-6 py-3 flex items-center gap-4">
          <span className="text-sm font-medium">{selectedCount} selected</span>
          <button onClick={() => setSelected({})} className="text-sm text-zinc-300 hover:text-white transition">Clear</button>
          <button onClick={() => setShowSaveDialog(true)} className="text-sm font-medium bg-blue-600 text-white px-4 py-1.5 rounded-full hover:bg-blue-700 transition">Send to Pipeline →</button>
        </div>
      )}

      {showSaveDialog && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={() => !saving && setShowSaveDialog(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-zinc-900">Name this pipeline</h2>
            <p className="text-sm text-zinc-500">Saving {selectedCount} row{selectedCount === 1 ? "" : "s"} to a new pipeline.</p>
            <input type="text" placeholder="e.g., My Phoenix Leads" value={pipelineName} onChange={(e) => setPipelineName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") savePipeline(); }} autoFocus className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowSaveDialog(false)} disabled={saving} className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900 transition disabled:opacity-40">Cancel</button>
              <button onClick={savePipeline} disabled={saving} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-40">{saving ? "Saving..." : "Save pipeline"}</button>
            </div>
          </div>
        </div>
      )}
      {dupePipelineId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !saving && setDupePipelineId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-zinc-900">A pipeline named &quot;{pipelineName.trim()}&quot; already exists</h2>
            <p className="text-sm text-zinc-500">
              Do you want to add these {selectedCount} row(s) into the existing pipeline (duplicates skipped), or create a new one with a different name?
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <button onClick={doMerge} disabled={saving} className="w-full px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-40">
                {saving ? "Merging..." : "Merge into existing pipeline"}
              </button>
              <button onClick={doCreateNewName} disabled={saving} className="w-full px-4 py-2 text-sm font-medium border border-zinc-300 text-zinc-700 rounded-lg hover:bg-zinc-50 transition disabled:opacity-40">
                Use a different name
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}