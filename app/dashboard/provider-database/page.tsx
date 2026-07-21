"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Papa from "papaparse";
import { supabase } from "@/app/lib/supabase";
import BrandLoader from "@/app/components/BrandLoader";
const SHEET_ID = "1kBmiJhXgM2UHJTxtctMxs4puCuHdQ1eKgk8JLb9FPCM";
const TABS = [
  { label: "Dentist", gid: "2097790243" },
  { label: "Hygienist", gid: "1213943970" },
] as const;
type TabLabel = (typeof TABS)[number]["label"];
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
      <button onClick={() => setOpen(!open)} className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-left text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between">
        <span className={selected.length === 0 ? "text-zinc-500" : ""}>{displayText}</span>
        <span className="text-zinc-400 ml-2">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg shadow-lg max-h-72 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-zinc-200 dark:border-zinc-700">
            <input type="text" placeholder={`Search ${label.toLowerCase()}...`} value={search} onChange={(e) => setSearch(e.target.value)} className="w-full px-2 py-1 text-sm border border-zinc-200 dark:border-zinc-700 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-1 focus:ring-blue-500" autoFocus />
          </div>
          <div className="overflow-y-auto flex-1">
            {selected.length > 0 && (
              <button onClick={() => onChange([])} className="w-full text-left px-3 py-2 text-xs text-blue-600 dark:text-blue-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-700">
                Clear selection ({selected.length})
              </button>
            )}
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-zinc-400">No matches</div>
            ) : (
              filteredOptions.map((opt) => (
                <label key={opt} className="flex items-center px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900 cursor-pointer">
                  <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} className="mr-2 h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-zinc-900 dark:text-zinc-100">{opt}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProviderDatabasePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabLabel>("Dentist");
  const [data, setData] = useState<Record<TabLabel, Row[]>>({ Dentist: [], Hygienist: [] });
  const [loading, setLoading] = useState<Record<TabLabel, boolean>>({ Dentist: true, Hygienist: true });
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState<string[]>([]);
  const [stateFilter, setStateFilter] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  // Selection: keyed by license number so switching tabs/filters doesn't lose selections
  const [selected, setSelected] = useState<Record<string, Row & { _tab: TabLabel }>>({});
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [pipelineName, setPipelineName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (localStorage.getItem("loggedIn") !== "true") router.push("/");
  }, [router]);

  useEffect(() => {
    const fetchTab = async (label: TabLabel, gid: string) => {
      try {
        const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch ${label} tab (is the sheet public?)`);
        const csv = await res.text();
        const parsed = Papa.parse<Row>(csv, { header: true, skipEmptyLines: true });
        setData((prev) => ({ ...prev, [label]: parsed.data }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load data");
      } finally {
        setLoading((prev) => ({ ...prev, [label]: false }));
      }
    };
    TABS.forEach((t) => fetchTab(t.label, t.gid));
  }, []);

  useEffect(() => {
    setSearch(""); setCityFilter([]); setStateFilter([]);
  }, [activeTab]);

  useEffect(() => { setPage(1); }, [search, cityFilter, stateFilter, activeTab]);

  const rows = data[activeTab];

  const uniqueCities = useMemo(() => Array.from(new Set(rows.map((r) => r["City"]).filter(Boolean))).sort(), [rows]);
  const uniqueStates = useMemo(() => Array.from(new Set(rows.map((r) => r["State"]).filter(Boolean))).sort(), [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (cityFilter.length > 0 && !cityFilter.includes(r["City"])) return false;
      if (stateFilter.length > 0 && !stateFilter.includes(r["State"])) return false;
      if (s) {
        const hay = `${r["First Name"] ?? ""} ${r["Middle Name"] ?? ""} ${r["Last Name"] ?? ""} ${r["Business Name"] ?? ""} ${r["City"] ?? ""} ${r["License Number"] ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [rows, search, cityFilter, stateFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const toggleRow = (r: Row) => {
    const key = `${activeTab}::${r["License Number"]}`;
    setSelected((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = { ...r, _tab: activeTab };
      return next;
    });
  };

  const isRowSelected = (r: Row) => !!selected[`${activeTab}::${r["License Number"]}`];

  const allOnPageSelected = paged.length > 0 && paged.every(isRowSelected);
  const toggleAllOnPage = () => {
    setSelected((prev) => {
      const next = { ...prev };
      if (allOnPageSelected) {
        paged.forEach((r) => delete next[`${activeTab}::${r["License Number"]}`]);
      } else {
        paged.forEach((r) => {
          const key = `${activeTab}::${r["License Number"]}`;
          if (r["License Number"]) next[key] = { ...r, _tab: activeTab };
        });
      }
      return next;
    });
  };

  const selectedCount = Object.keys(selected).length;
  const isLoading = loading[activeTab];
  const activeChipCount = cityFilter.length + stateFilter.length;
  const hasAnyFilter = search || activeChipCount > 0;

  const savePipeline = async () => {
    const trimmedName = pipelineName.trim();
    if (!trimmedName) { setSaveError("Please enter a name"); return; }
    setSaving(true); setSaveError(null);

    try {
      const rowsBySource: Record<string, (Row & { _tab: TabLabel })[]> = {};
      Object.values(selected).forEach((r) => {
        if (!rowsBySource[r._tab]) rowsBySource[r._tab] = [];
        rowsBySource[r._tab].push(r);
      });

      // Create one pipeline per source tab (so Dentist and Hygienist selections are separate pipelines)
      const tabs = Object.keys(rowsBySource);
      const suffix = tabs.length > 1 ? " (%TAB%)" : "";

      for (const tab of tabs) {
        const finalName = suffix ? trimmedName + suffix.replace("%TAB%", tab) : trimmedName;
        const { data: pipeline, error: pErr } = await supabase
          .from("pipelines")
          .insert({ name: finalName, source_tab: tab, project: "DSCP" })
          .select()
          .single();
        if (pErr) throw pErr;

        const rowsToInsert = rowsBySource[tab].map((r) => ({
          pipeline_id: pipeline.id,
          license_number: r["License Number"] || "",
          row_data: r,
        }));

        const { error: rErr } = await supabase.from("pipeline_rows").insert(rowsToInsert);
        if (rErr) throw rErr;
      }

      setSelected({});
      setShowSaveDialog(false);
      setPipelineName("");
      router.push("/pipelines");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save pipeline");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-900">
      <header className="flex justify-between items-center px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition">← Back</Link>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Provider Database</h1>
        <Link href="/pipelines" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Pipelines →</Link>
      </header>

      <main className="flex-1 p-6 pb-32">
        <div className="max-w-7xl mx-auto space-y-5">
          <div className="flex space-x-1 bg-zinc-200/50 dark:bg-zinc-800 p-1 rounded-lg w-fit">
            {TABS.map((t) => (
              <button key={t.label} onClick={() => setActiveTab(t.label)} className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${activeTab === t.label ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 shadow-sm" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50"}`}>
                {t.label}s
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input type="text" placeholder="Search name, business, city, license #..." value={search} onChange={(e) => setSearch(e.target.value)} className="px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <MultiSelect label="Cities" placeholder="All cities" options={uniqueCities} selected={cityFilter} onChange={setCityFilter} />
            <MultiSelect label="States" placeholder="All states" options={uniqueStates} selected={stateFilter} onChange={setStateFilter} />
          </div>

          <div className="flex flex-wrap gap-3 items-center min-h-[28px]">
            {hasAnyFilter && (
              <button onClick={() => { setSearch(""); setCityFilter([]); setStateFilter([]); }} className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition">
                Clear all filters
              </button>
            )}
            <div className="ml-auto text-sm text-zinc-500 dark:text-zinc-400">
              {isLoading ? "Loading..." : `${filtered.length.toLocaleString()} result${filtered.length === 1 ? "" : "s"}`}
            </div>
          </div>

          {activeChipCount > 0 && (
            <div className="flex flex-wrap gap-2">
              {cityFilter.map((c) => (
                <span key={`c-${c}`} className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md">
                  City: {c}
                  <button onClick={() => setCityFilter(cityFilter.filter((v) => v !== c))} className="hover:text-blue-900 dark:hover:text-blue-100">✕</button>
                </span>
              ))}
              {stateFilter.map((s) => (
                <span key={`s-${s}`} className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-md">
                  State: {s}
                  <button onClick={() => setStateFilter(stateFilter.filter((v) => v !== s))} className="hover:text-purple-900 dark:hover:text-purple-100">✕</button>
                </span>
              ))}
            </div>
          )}

          <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-700 overflow-hidden">
            {error ? <div className="p-12 text-center text-red-500">{error}</div>
            : isLoading ? <BrandLoader label={`Loading ${activeTab} data...`} />
            : filtered.length === 0 ? <div className="p-12 text-center text-zinc-400">No results</div>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-700">
                    <tr>
                      <th className="px-4 py-3 w-10">
                        <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllOnPage} className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500" />
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700 dark:text-zinc-300">Name</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700 dark:text-zinc-300">Business</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700 dark:text-zinc-300">City</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700 dark:text-zinc-300">State</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700 dark:text-zinc-300">Telephone</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700 dark:text-zinc-300">License #</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700 dark:text-zinc-300">Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((r, i) => (
                      <tr key={i} onClick={() => toggleRow(r)} className={`border-b border-zinc-100 dark:border-zinc-700/50 cursor-pointer transition ${isRowSelected(r) ? "bg-blue-50/50 dark:bg-blue-900/10" : "hover:bg-zinc-50 dark:hover:bg-zinc-900/50"}`}>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={isRowSelected(r)} onChange={() => toggleRow(r)} className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500" />
                        </td>
                        <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                          {[r["First Name"], r["Middle Name"], r["Last Name"]].filter(Boolean).join(" ")}
                          {r["Degree"] && <span className="text-zinc-400 ml-1">, {r["Degree"]}</span>}
                        </td>
                        <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{r["Business Name"] || "—"}</td>
                        <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{r["City"] || "—"}</td>
                        <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{r["State"] || "—"}</td>
                        <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{r["Telephone"] || "—"}</td>
                        <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300 whitespace-nowrap font-mono text-xs">{r["License Number"] || "—"}</td>
                        <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{r["License Expiration Date"] || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {!isLoading && filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-zinc-500 dark:text-zinc-400">Page {page} of {totalPages}</div>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition">Previous</button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition">Next</button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Floating action bar */}
      {selectedCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 rounded-full shadow-2xl px-6 py-3 flex items-center gap-4">
          <span className="text-sm font-medium">{selectedCount} selected</span>
          <button onClick={() => setSelected({})} className="text-sm text-zinc-300 dark:text-zinc-600 hover:text-white dark:hover:text-zinc-900 transition">Clear</button>
          <button onClick={() => setShowSaveDialog(true)} className="text-sm font-medium bg-blue-600 text-white px-4 py-1.5 rounded-full hover:bg-blue-700 transition">
            Send to Pipeline →
          </button>
        </div>
      )}

      {/* Save dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={() => !saving && setShowSaveDialog(false)}>
          <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Name this pipeline</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              You&apos;re saving {selectedCount} row{selectedCount === 1 ? "" : "s"} to a new pipeline. Give it a name so you can find it later.
            </p>
            <input
              type="text"
              placeholder="e.g., Tucson Outreach Dec 2026"
              value={pipelineName}
              onChange={(e) => setPipelineName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") savePipeline(); }}
              autoFocus
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {saveError && <p className="text-sm text-red-500">{saveError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowSaveDialog(false)} disabled={saving} className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition disabled:opacity-40">Cancel</button>
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