"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import BrandLoader from "@/app/components/BrandLoader";

const ROW_LIMIT = 5000;
const PAGE_SIZE = 50;

type UploadRow = {
  id: string;
  owner_id: string;
  batch_name: string | null;
  row_data: Record<string, string>;
  created_at: string;
};

// Columns we expect (same as Provider Database)
const EXPECTED = ["First Name", "Last Name", "Business Name", "City", "State", "License Number"];

export default function MyDataPage() {
  const router = useRouter();
  const { profile, checking } = useAuth();
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Record<string, UploadRow>>({});
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [pipelineName, setPipelineName] = useState("");
  const [saving, setSaving] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [owners, setOwners] = useState<{ id: string; label: string }[]>([]);

  // Load uploads (role-based visibility)
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
      // admin: all
      const { data, error: e } = await query;
      if (e) throw e;
      setRows((data ?? []) as UploadRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  }, [profile]);

  useEffect(() => { if (profile) load(); }, [profile, load]);

  // Build owner filter options for managers/admins
  useEffect(() => {
    if (!profile || profile.role === "member") return;
    const build = async () => {
      const { data } = await supabase.from("profiles").select("id, email, full_name, role");
      let list = (data ?? []).map((u) => ({ id: u.id, label: (u.full_name || u.email) + (u.id === profile.id ? " (me)" : ""), role: u.role }));
      if (profile.role === "manager") list = list.filter((u) => u.role === "member" || u.id === profile.id);
      setOwners(list.map(({ id, label }) => ({ id, label })));
    };
    build();
  }, [profile]);

  // How many rows this user already has (for the limit)
  const myRowCount = useMemo(
    () => (profile ? rows.filter((r) => r.owner_id === profile.id).length : 0),
    [rows, profile]
  );

  const handleFile = async (file: File) => {
    if (!profile) return;
    setUploading(true); setUploadMsg(null);
    try {
      let parsed: Record<string, string>[] = [];

      if (file.name.toLowerCase().endsWith(".csv")) {
        const text = await file.text();
        const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
        parsed = result.data;
      } else if (file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls")) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        parsed = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
      } else {
        throw new Error("Please upload a .csv or .xlsx file");
      }

      // Keep only rows that have at least a name or business
      parsed = parsed.filter((r) => (r["First Name"] || r["Last Name"] || r["Business Name"]));

      if (parsed.length === 0) throw new Error("No usable rows found. Check your column headers match the Provider Database.");

      // Enforce the 5,000-row limit
      if (myRowCount + parsed.length > ROW_LIMIT) {
        throw new Error(`This upload would exceed your ${ROW_LIMIT.toLocaleString()}-row limit. You have ${myRowCount.toLocaleString()} rows; this file has ${parsed.length.toLocaleString()}.`);
      }

      const batchName = file.name;
      const records = parsed.map((r) => ({
        owner_id: profile.id,
        batch_name: batchName,
        row_data: r,
      }));

      // Insert in chunks of 500 to be safe
      for (let i = 0; i < records.length; i += 500) {
        const chunk = records.slice(i, i + 500);
        const { error: insErr } = await supabase.from("user_uploads").insert(chunk);
        if (insErr) throw insErr;
      }

      setUploadMsg(`Uploaded ${parsed.length.toLocaleString()} rows from "${batchName}".`);
      load();
    } catch (e) {
      setUploadMsg(e instanceof Error ? e.message : "Upload failed");
    } finally { setUploading(false); }
  };

  // Filtering + pagination
  const filtered = useMemo(() => {
    let list = rows;
    if (ownerFilter !== "all") list = list.filter((r) => r.owner_id === ownerFilter);
    const s = search.trim().toLowerCase();
    if (s) {
      list = list.filter((r) => {
        const d = r.row_data;
        return `${d["First Name"] ?? ""} ${d["Last Name"] ?? ""} ${d["Business Name"] ?? ""} ${d["City"] ?? ""}`.toLowerCase().includes(s);
      });
    }
    return list;
  }, [rows, search, ownerFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
  useEffect(() => { setPage(1); }, [search, ownerFilter]);

  const toggleRow = (r: UploadRow) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[r.id]) delete next[r.id]; else next[r.id] = r;
      return next;
    });
  };
  const selectedCount = Object.keys(selected).length;

  const savePipeline = async () => {
    if (!profile || !pipelineName.trim()) return;
    setSaving(true);
    try {
      const { data: pipeline, error: pErr } = await supabase
        .from("pipelines")
        .insert({ name: pipelineName.trim(), source_tab: "Upload", project: "DSCP", owner_id: profile.id })
        .select().single();
      if (pErr) throw pErr;

      const rowsToInsert = Object.values(selected).map((r) => ({
        pipeline_id: pipeline.id,
        license_number: (r.row_data["License Number"] || `UP::${r.id}`).trim(),
        row_data: r.row_data,
      }));
      const { error: rErr } = await supabase.from("pipeline_rows").insert(rowsToInsert);
      if (rErr) throw rErr;

      setSelected({}); setShowSaveDialog(false); setPipelineName("");
      router.push("/pipelines");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save pipeline");
    } finally { setSaving(false); }
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
            <p className="text-sm text-zinc-500">CSV or Excel with columns: {EXPECTED.join(", ")}.</p>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
              className="block text-sm text-zinc-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer"
            />
            {uploading && <p className="text-sm text-blue-600">Uploading…</p>}
            {uploadMsg && <p className="text-sm text-zinc-700">{uploadMsg}</p>}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <input type="text" placeholder="Search name, business, city..." value={search} onChange={(e) => setSearch(e.target.value)} className="px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64" />
            {profile && profile.role !== "member" && owners.length > 0 && (
              <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} className="px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">Everyone's data</option>
                {owners.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            )}
            <div className="ml-auto text-sm text-zinc-500">{loading ? "Loading..." : `${filtered.length.toLocaleString()} rows`}</div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
            {error ? <div className="p-8 text-center text-red-500">{error}</div>
            : loading ? <BrandLoader label="Loading your data..." />
            : filtered.length === 0 ? <div className="p-12 text-center text-zinc-400">No data yet. Upload a CSV or Excel file above.</div>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 border-b border-zinc-200">
                    <tr>
                      <th className="px-4 py-3 w-10"></th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700">Name</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700">Business</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700">City</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700">License #</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700">Batch</th>
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
                          <td className="px-4 py-3 text-zinc-900 whitespace-nowrap font-medium">{[d["First Name"], d["Last Name"]].filter(Boolean).join(" ") || "—"}</td>
                          <td className="px-4 py-3 text-zinc-700">{d["Business Name"] || "—"}</td>
                          <td className="px-4 py-3 text-zinc-700 whitespace-nowrap">{d["City"] || "—"}</td>
                          <td className="px-4 py-3 text-zinc-700 font-mono text-xs whitespace-nowrap">{d["License Number"] || "—"}</td>
                          <td className="px-4 py-3 text-zinc-400 text-xs truncate max-w-[160px]" title={r.batch_name || ""}>{r.batch_name || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {!loading && filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-zinc-500">Page {page} of {totalPages}</div>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-sm border border-zinc-300 rounded-lg bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 transition">Previous</button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 text-sm border border-zinc-300 rounded-lg bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 transition">Next</button>
              </div>
            </div>
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
    </div>
  );
}