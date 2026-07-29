"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { lookupByNpi, lookupByName, type ProviderResult } from "@/app/lib/enrich";
import BrandLoader from "@/app/components/BrandLoader";

export default function ProviderLookupPage() {
  const router = useRouter();
  const { profile, checking } = useAuth();

  const [npi, setNpi] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [state, setState] = useState("AZ");
const [city, setCity] = useState("");
  const [results, setResults] = useState<ProviderResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const [selected, setSelected] = useState<Record<string, ProviderResult>>({});
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [pipelineName, setPipelineName] = useState("");
  const [saving, setSaving] = useState(false);

  const runNpiSearch = async () => {
    setLoading(true); setError(null); setSearched(true); setSelected({});
    try {
      const r = await lookupByNpi(npi);
      setResults(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setResults([]);
    } finally { setLoading(false); }
  };

  const runNameSearch = async () => {
    setLoading(true); setError(null); setSearched(true); setSelected({});
    try {
      const r = await lookupByName(first.trim(), last.trim(), state.trim(), city.trim());
      setResults(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setResults([]);
    } finally { setLoading(false); }
  };

  const toggle = (r: ProviderResult) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[r.npi]) delete next[r.npi]; else next[r.npi] = r;
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
        .insert({ name: pipelineName.trim(), source_tab: "Lookup", project: "DSCP", owner_id: profile.id })
        .select().single();
      if (pErr) throw pErr;

      const rowsToInsert = Object.values(selected).map((r) => {
        const [firstName, ...rest] = r.name.replace(/,.*$/, "").split(" ");
        const lastName = rest.join(" ");
        return {
          pipeline_id: pipeline.id,
          license_number: r.license || `NPI::${r.npi}`,
          row_data: {
            "First Name": firstName || "",
            "Last Name": lastName || "",
            "Business Name": "",
            "City": r.city,
            "State": r.state,
            "License Number": r.license,
            "Telephone": r.phone,
            "NPI": r.npi,
          },
        };
      });
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
        <h1 className="text-lg font-semibold text-zinc-900">Provider Lookup</h1>
        <Link href="/pipelines" className="text-sm text-blue-600 hover:underline">Pipelines →</Link>
      </header>

      <main className="flex-1 p-6 pb-32">
        <div className="max-w-5xl mx-auto space-y-5">
          {/* Search by NPI */}
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5 space-y-3">
            <h2 className="font-semibold text-zinc-900">Search by NPI Number</h2>
            <div className="flex gap-2">
              <input type="text" value={npi} onChange={(e) => setNpi(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runNpiSearch(); }} placeholder="10-digit NPI (e.g. 1306056502)" className="flex-1 px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={runNpiSearch} disabled={loading} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50">Search</button>
            </div>
          </div>

          {/* Search by Name */}
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5 space-y-3">
            <h2 className="font-semibold text-zinc-900">Search by Name</h2>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
              <input type="text" value={first} onChange={(e) => setFirst(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runNameSearch(); }} placeholder="First name" className="px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="text" value={last} onChange={(e) => setLast(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runNameSearch(); }} placeholder="Last name" className="px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="text" value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runNameSearch(); }} placeholder="City (e.g. Phoenix)" className="px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="text" value={state} onChange={(e) => setState(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") runNameSearch(); }} placeholder="State (e.g. AZ)" maxLength={2} className="px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase" />
              <button onClick={runNameSearch} disabled={loading} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50">Search</button>
            </div>
            <p className="text-xs text-zinc-400">Tip: searching by license number isn&apos;t supported nationally — use NPI or name. The license number appears in results.</p>
          </div>

          {/* Results */}
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
            {error ? <div className="p-8 text-center text-red-500">{error}</div>
            : loading ? <BrandLoader label="Searching NPPES registry..." />
            : !searched ? <div className="p-12 text-center text-zinc-400">Search by NPI or name to find a provider.</div>
            : results.length === 0 ? <div className="p-12 text-center text-zinc-400">No providers found. Check the NPI/name and try again.</div>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 border-b border-zinc-200">
                    <tr>
                      <th className="px-4 py-3 w-10"></th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700">Name</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700">NPI</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700">Specialty</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700">Practice</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700">License</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-700">Phone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => {
                      const isSel = !!selected[r.npi];
                      return (
                        <tr key={r.npi} onClick={() => toggle(r)} className={`border-b border-zinc-100 cursor-pointer transition ${isSel ? "bg-blue-50/50" : ""}`}>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={isSel} onChange={() => toggle(r)} className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500" />
                          </td>
                          <td className="px-4 py-3 text-zinc-900 whitespace-nowrap font-medium">{r.name}</td>
                          <td className="px-4 py-3 text-zinc-700 font-mono text-xs">{r.npi}</td>
                          <td className="px-4 py-3 text-zinc-700">{r.specialty || "—"}</td>
                          <td className="px-4 py-3 text-zinc-700 text-xs">{r.practice || "—"}</td>
                          <td className="px-4 py-3 text-zinc-700 font-mono text-xs">{r.license || "—"}{r.licenseState ? ` (${r.licenseState})` : ""}</td>
                          <td className="px-4 py-3 text-zinc-700 whitespace-nowrap">{r.phone || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
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
            <p className="text-sm text-zinc-500">Saving {selectedCount} provider{selectedCount === 1 ? "" : "s"} to a new pipeline.</p>
            <input type="text" placeholder="e.g., Looked-up providers" value={pipelineName} onChange={(e) => setPipelineName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") savePipeline(); }} autoFocus className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
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