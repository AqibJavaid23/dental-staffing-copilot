"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Papa from "papaparse";
import { supabase } from "@/app/lib/supabase";
import BrandLoader from "@/app/components/BrandLoader";
import { useAuth } from "@/app/lib/useAuth";
const SHEET_ID = "1GfcUmQWXdi9Z-LMEdahn63XhFrzK1Pxi";
const TAB_NAME = "Candidate Queue";
const PAGE_SIZE = 50;

type Row = Record<string, string>;

function MultiSelect({
  label, placeholder, options, selected, onChange,
}: {
  label: string; placeholder: string; options: string[]; selected: string[]; onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(""); }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filteredOptions = useMemo(
    () => options.filter((o) => o.toLowerCase().includes(search.toLowerCase())),
    [options, search]
  );

  const toggle = (v: string) => {
    if (selected.includes(v)) onChange(selected.filter((s) => s !== v));
    else onChange([...selected, v]);
  };

  const displayText = selected.length === 0 ? placeholder : selected.length === 1 ? selected[0] : `${selected.length} ${label.toLowerCase()} selected`;

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-left text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between">
        <span className={selected.length === 0 ? "text-zinc-500" : ""}>{displayText}</span>
        <span className="text-zinc-400 ml-2">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-zinc-300 rounded-lg shadow-lg max-h-72 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-zinc-200">
            <input type="text" placeholder={`Search ${label.toLowerCase()}...`} value={search} onChange={(e) => setSearch(e.target.value)} className="w-full px-2 py-1 text-sm border border-zinc-200 rounded bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-blue-500" autoFocus />
          </div>
          <div className="overflow-y-auto flex-1">
            {selected.length > 0 && (
              <button onClick={() => onChange([])} className="w-full text-left px-3 py-2 text-xs text-blue-600 hover:bg-zinc-50 border-b border-zinc-100">
                Clear selection ({selected.length})
              </button>
            )}
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-zinc-400">No matches</div>
            ) : (
              filteredOptions.map((opt) => (
                <label key={opt} className="flex items-center px-3 py-2 text-sm hover:bg-zinc-50 cursor-pointer">
                  <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} className="mr-2 h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-zinc-900">{opt}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const r = (role || "").toLowerCase();
  if (r.includes("owner")) return <span className="inline-flex px-2 py-0.5 text-xs rounded-md bg-emerald-50 text-emerald-700 font-medium">Owner</span>;
  if (r.includes("associate")) return <span className="inline-flex px-2 py-0.5 text-xs rounded-md bg-blue-50 text-blue-700 font-medium">Associate</span>;
  if (r) return <span className="inline-flex px-2 py-0.5 text-xs rounded-md bg-zinc-100 text-zinc-600">{role}</span>;
  return <span className="text-zinc-400">—</span>;
}

function ConfidenceBadge({ level }: { level: string }) {
  const l = (level || "").toLowerCase();
  if (l === "high") return <span className="inline-flex px-2 py-0.5 text-xs rounded-md bg-emerald-50 text-emerald-700">High</span>;
  if (l === "medium") return <span className="inline-flex px-2 py-0.5 text-xs rounded-md bg-amber-50 text-amber-700">Medium</span>;
  if (l === "low") return <span className="inline-flex px-2 py-0.5 text-xs rounded-md bg-red-50 text-red-700">Low</span>;
  if (level) return <span className="text-zinc-600 text-xs">{level}</span>;
  return <span className="text-zinc-400">—</span>;
}

export default function CandidatesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [confidenceFilter, setConfidenceFilter] = useState<string[]>([]);
  const [cityFilter, setCityFilter] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<Record<string, Row>>({});
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [pipelineName, setPipelineName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { checking } = useAuth();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(TAB_NAME)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch candidate data (is the sheet shared?)");
        const csv = await res.text();
        const parsed = Papa.parse<Row>(csv, { header: true, skipEmptyLines: true });
        setRows(parsed.data.filter((r) => (r["First Name"] || r["Last Name"])));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load data");
      } finally { setLoading(false); }
    };
    fetchData();
  }, []);

  useEffect(() => { setPage(1); }, [search, roleFilter, confidenceFilter, cityFilter]);

  // Stable key per candidate (no license number in this sheet)
  const rowKey = (r: Row) => `CAND::${(r["First Name"] || "").trim()}_${(r["Last Name"] || "").trim()}_${(r["Office #"] || r["Office Name"] || "").trim()}`.replace(/\s+/g, "-");

  const uniqueRoles = useMemo(() => Array.from(new Set(rows.map((r) => r["Confirmed Role"]).filter(Boolean))).sort(), [rows]);
  const uniqueConfidence = useMemo(() => Array.from(new Set(rows.map((r) => r["Confidence"]).filter(Boolean))).sort(), [rows]);
  const uniqueCities = useMemo(() => Array.from(new Set(rows.map((r) => (r["City"] || "").trim()).filter(Boolean))).sort(), [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (roleFilter.length > 0 && !roleFilter.includes(r["Confirmed Role"])) return false;
      if (confidenceFilter.length > 0 && !confidenceFilter.includes(r["Confidence"])) return false;
      if (cityFilter.length > 0 && !cityFilter.includes((r["City"] || "").trim())) return false;
      if (s) {
        const hay = `${r["First Name"] ?? ""} ${r["Last Name"] ?? ""} ${r["Office Name"] ?? ""} ${r["City"] ?? ""} ${r["School"] ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [rows, search, roleFilter, confidenceFilter, cityFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const toggleRow = (r: Row) => {
    const key = rowKey(r);
    setSelected((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = r;
      return next;
    });
  };
  const isRowSelected = (r: Row) => !!selected[rowKey(r)];
  const allOnPageSelected = paged.length > 0 && paged.every(isRowSelected);
  const toggleAllOnPage = () => {
    setSelected((prev) => {
      const next = { ...prev };
      if (allOnPageSelected) paged.forEach((r) => delete next[rowKey(r)]);
      else paged.forEach((r) => { next[rowKey(r)] = r; });
      return next;
    });
  };

  const selectedCount = Object.keys(selected).length;

  const savePipeline = async () => {
    const trimmedName = pipelineName.trim();
    if (!trimmedName) { setSaveError("Please enter a name"); return; }
    setSaving(true); setSaveError(null);
    try {
      const { data: pipeline, error: pErr } = await supabase
        .from("pipelines")
        .insert({ name: trimmedName, source_tab: "Candidate", project: "DSCP" })
        .select()
        .single();
      if (pErr) throw pErr;

      const rowsToInsert = Object.entries(selected).map(([key, r]) => ({
        pipeline_id: pipeline.id,
        license_number: key, // stable generated key (sheet has no license numbers)
        row_data: {
          ...r,
          "Business Name": r["Office Name"] || "",
          "Telephone": r["Office Phone"] || "",
        },
      }));

      const { error: rErr } = await supabase.from("pipeline_rows").insert(rowsToInsert);
      if (rErr) throw rErr;

      setSelected({});
      setShowSaveDialog(false);
      setPipelineName("");
      router.push("/pipelines");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save pipeline");
    } finally { setSaving(false); }
  };
if (checking) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading..." /></div>;
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="flex justify-between items-center px-6 py-4 border-b border-zinc-200 bg-white">
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900 transition">← Back</Link>
        <h1 className="text-lg font-semibold text-zinc-900">Candidate Queue</h1>
        <Link href="/pipelines" className="text-sm text-blue-600 hover:underline">Pipelines →</Link>
      </header>

      <main className="flex-1 p-6 pb-32">
        <div className="max-w-7xl mx-auto space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input type="text" placeholder="Search name, office, city, school..." value={search} onChange={(e) => setSearch(e.target.value)} className="px-3 py-2 border border-zinc-300 rounded-lg bg-white text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <MultiSelect label="Roles" placeholder="All roles" options={uniqueRoles} selected={roleFilter} onChange={setRoleFilter} />
            <MultiSelect label="Confidence" placeholder="All confidence" options={uniqueConfidence} selected={confidenceFilter} onChange={setConfidenceFilter} />
            <MultiSelect label="Cities" placeholder="All cities" options={uniqueCities} selected={cityFilter} onChange={setCityFilter} />
          </div>

          <div className="flex flex-wrap gap-3 items-center min-h-[28px]">
            {(search || roleFilter.length > 0 || confidenceFilter.length > 0 || cityFilter.length > 0) && (
              <button onClick={() => { setSearch(""); setRoleFilter([]); setConfidenceFilter([]); setCityFilter([]); }} className="text-sm text-zinc-500 hover:text-zinc-900 transition">
                Clear all filters
              </button>
            )}
            <div className="ml-auto text-sm text-zinc-500">
              {loading ? "Loading..." : `${filtered.length.toLocaleString()} candidate${filtered.length === 1 ? "" : "s"}`}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
            {error ? <div className="p-12 text-center text-red-500">{error}</div>
            : loading ? <BrandLoader label="Loading candidates..." />
            : filtered.length === 0 ? <div className="p-12 text-center text-zinc-400">No candidates match</div>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 border-b border-zinc-200">
                    <tr>
                      <th className="px-4 py-3 w-10">
                        <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllOnPage} className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500" />
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700">Name</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700">Office</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700">City</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700">Role</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700">Confidence</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700">Social</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700">Lic. Year</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((r, i) => (
                      <tr key={i} onClick={() => toggleRow(r)} className={`border-b border-zinc-100 cursor-pointer transition ${isRowSelected(r) ? "bg-blue-50/50" : ""}`}>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={isRowSelected(r)} onChange={() => toggleRow(r)} className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500" />
                        </td>
                        <td className="px-4 py-3 text-zinc-900 whitespace-nowrap font-medium">
                          {[r["First Name"], r["Last Name"]].filter(Boolean).join(" ")}
                          {r["Degree"] && <span className="text-zinc-400 font-normal ml-1">, {r["Degree"]}</span>}
                        </td>
                        <td className="px-4 py-3 text-zinc-700">{r["Office Name"] || "—"}</td>
                        <td className="px-4 py-3 text-zinc-700 whitespace-nowrap">{r["City"] || "—"}</td>
                        <td className="px-4 py-3 whitespace-nowrap"><RoleBadge role={r["Confirmed Role"]} /></td>
                        <td className="px-4 py-3 whitespace-nowrap"><ConfidenceBadge level={r["Confidence"]} /></td>
                        <td className="px-4 py-3 text-zinc-700 whitespace-nowrap">{r["Social Profile Found"] || "—"}</td>
                        <td className="px-4 py-3 text-zinc-700 whitespace-nowrap">{r["Initial License Year"] || "—"}</td>
                        <td className="px-4 py-3 text-zinc-500 text-xs max-w-[220px] truncate" title={r["Notes"]}>{r["Notes"] || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {!loading && filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-zinc-500">Page {page} of {totalPages}</div>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-sm border border-zinc-300 rounded-lg bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition">Previous</button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 text-sm border border-zinc-300 rounded-lg bg-white text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition">Next</button>
              </div>
            </div>
          )}
        </div>
      </main>

      {selectedCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 bg-zinc-900 text-white rounded-full shadow-2xl px-6 py-3 flex items-center gap-4">
          <span className="text-sm font-medium">{selectedCount} selected</span>
          <button onClick={() => setSelected({})} className="text-sm text-zinc-300 hover:text-white transition">Clear</button>
          <button onClick={() => setShowSaveDialog(true)} className="text-sm font-medium bg-blue-600 text-white px-4 py-1.5 rounded-full hover:bg-blue-700 transition">
            Send to Pipeline →
          </button>
        </div>
      )}

      {showSaveDialog && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={() => !saving && setShowSaveDialog(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-zinc-900">Name this pipeline</h2>
            <p className="text-sm text-zinc-500">
              Saving {selectedCount} candidate{selectedCount === 1 ? "" : "s"} to a new pipeline.
            </p>
            <input
              type="text"
              placeholder="e.g., Phoenix Owners — July"
              value={pipelineName}
              onChange={(e) => setPipelineName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") savePipeline(); }}
              autoFocus
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {saveError && <p className="text-sm text-red-500">{saveError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowSaveDialog(false)} disabled={saving} className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900 transition disabled:opacity-40">Cancel</button>
              <button onClick={savePipeline} disabled={saving} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed">
                {saving ? "Saving..." : "Save pipeline"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}