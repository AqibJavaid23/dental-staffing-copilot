"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import BrandLoader from "@/app/components/BrandLoader";

type Pool = {
  id: string;
  company_name: string;
  job_title: string | null;
  city: string | null;
  state: string | null;
  job_url: string | null;
  notes: string | null;
};

type PoolTalent = {
  id: string;
  pipeline_row_id: string | null;
  license_number: string | null;
  name: string;
  city: string | null;
  state: string | null;
  row_data: Record<string, string> | null;
  match_status: string;
};

type TalentOption = {
  rowId: string;
  license_number: string;
  name: string;
  city: string;
  state: string;
  business: string;
  row_data: Record<string, string>;
};

type PipeGroup = {
  pipelineId: string;
  pipelineName: string;
  options: TalentOption[];
};

const MATCH_STATUSES = [
  { value: "candidate", label: "Candidate", color: "#71717a" },
  { value: "contacted", label: "Contacted", color: "#0080D0" },
  { value: "interested", label: "Interested", color: "#059669" },
  { value: "placed", label: "Placed ✓", color: "#123B78" },
  { value: "passed", label: "Passed", color: "#dc2626" },
];
const matchMeta = (v: string) => MATCH_STATUSES.find((s) => s.value === v) || MATCH_STATUSES[0];

export default function PoolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { checking } = useAuth();

  const [pool, setPool] = useState<Pool | null>(null);
  const [talent, setTalent] = useState<PoolTalent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Picker
  const [showPicker, setShowPicker] = useState(false);
  const [groups, setGroups] = useState<PipeGroup[]>([]);
  const [optLoading, setOptLoading] = useState(false);
  const [openGroup, setOpenGroup] = useState<PipeGroup | null>(null); // null = pipeline list; set = drilled in
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Record<string, TalentOption>>({});
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data: p, error: pErr } = await supabase.from("pools").select("*").eq("id", id).single();
      if (pErr) throw pErr;
      setPool(p);
      const { data: t } = await supabase.from("pool_talent").select("*").eq("pool_id", id).order("added_at", { ascending: true });
      setTalent((t ?? []) as PoolTalent[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pool");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Load talent grouped by Talent pipeline
  const loadOptions = async () => {
    setOptLoading(true);
    try {
      const { data: pipes } = await supabase.from("pipelines").select("id, name, source_tab, pipeline_type").order("created_at", { ascending: false });
      const talentPipes = (pipes ?? []).filter((p) => (p.pipeline_type || (p.source_tab === "Jobs" ? "hiring" : "talent")) === "talent");
      const pipeIds = talentPipes.map((p) => p.id);
      if (pipeIds.length === 0) { setGroups([]); setOptLoading(false); return; }

      const { data: rows } = await supabase.from("pipeline_rows").select("*").in("pipeline_id", pipeIds);
      const alreadyIn = new Set(talent.map((t) => t.pipeline_row_id));

      const byPipe: Record<string, TalentOption[]> = {};
      (rows ?? []).forEach((r) => {
        if (alreadyIn.has(r.id)) return;
        const d = (r.row_data || {}) as Record<string, string>;
        (byPipe[r.pipeline_id] ||= []).push({
          rowId: r.id,
          license_number: r.license_number || "",
          name: [d["First Name"], d["Last Name"]].filter(Boolean).join(" ") || "Unknown",
          city: d["City"] || "",
          state: d["State"] || "",
          business: d["Business Name"] || d["Office Name"] || "",
          row_data: d,
        });
      });

      const g: PipeGroup[] = talentPipes
        .map((p) => ({ pipelineId: p.id, pipelineName: p.name, options: byPipe[p.id] || [] }))
        .filter((grp) => grp.options.length > 0);
      setGroups(g);
    } finally { setOptLoading(false); }
  };

  const openPicker = () => { setPicked({}); setSearch(""); setOpenGroup(null); setShowPicker(true); loadOptions(); };

  const insertTalent = async (opts: TalentOption[]) => {
    if (opts.length === 0) return;
    setAdding(true);
    try {
      const records = opts.map((o) => ({
        pool_id: id,
        pipeline_row_id: o.rowId,
        license_number: o.license_number,
        name: o.name,
        city: o.city,
        state: o.state,
        row_data: o.row_data,
        match_status: "candidate",
      }));
      const { error } = await supabase.from("pool_talent").insert(records);
      if (error) throw error;
      setShowPicker(false);
      load();
    } catch (e) {
      alert("Failed to add talent: " + (e instanceof Error ? e.message : "unknown"));
    } finally { setAdding(false); }
  };

  const addWholePipeline = (g: PipeGroup) => {
    if (!confirm(`Add all ${g.options.length} people from "${g.pipelineName}" to this pool?`)) return;
    insertTalent(g.options); // already excludes anyone in the pool
  };

  const togglePick = (o: TalentOption) => {
    setPicked((prev) => {
      const next = { ...prev };
      if (next[o.rowId]) delete next[o.rowId]; else next[o.rowId] = o;
      return next;
    });
  };

  const removeTalent = async (talentId: string) => {
    if (!confirm("Remove this person from the pool?")) return;
    await supabase.from("pool_talent").delete().eq("id", talentId);
    load();
  };

  const changeMatchStatus = async (talentId: string, status: string) => {
    await supabase.from("pool_talent").update({ match_status: status }).eq("id", talentId);
    setTalent((prev) => prev.map((t) => (t.id === talentId ? { ...t, match_status: status } : t)));
  };

  const drillOptions = (openGroup?.options || []).filter((o) => {
    const s = search.trim().toLowerCase();
    if (!s) return true;
    return `${o.name} ${o.business} ${o.city}`.toLowerCase().includes(s);
  });

  if (checking) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading..." /></div>;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="flex justify-between items-center px-6 py-4 border-b border-zinc-200 bg-white">
        <Link href="/dashboard/pools" className="text-sm text-zinc-500 hover:text-zinc-900 transition">← All pools</Link>
        <h1 className="text-lg font-semibold text-zinc-900">Talent Pool</h1>
        <div className="w-20" />
      </header>

      <main className="flex-1 p-6">
        <div className="max-w-5xl mx-auto space-y-5">
          {error ? <div className="p-6 text-red-500 bg-red-50 rounded-lg">{error}</div>
          : loading ? <BrandLoader label="Loading pool..." />
          : !pool ? <div className="p-12 text-center text-zinc-400">Pool not found.</div>
          : (
            <>
              <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">🏢 Hiring Practice</span>
                  {pool.job_title && <span className="text-sm text-zinc-500">{pool.job_title}</span>}
                </div>
                <h2 className="text-2xl font-semibold text-zinc-900">{pool.company_name}</h2>
                <p className="text-sm text-zinc-500 mt-1">{[pool.city, pool.state].filter(Boolean).join(", ") || "—"}</p>
                {pool.job_url && <a href={pool.job_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline mt-2 inline-block">View job posting →</a>}
              </div>

              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-zinc-900">Matched Talent ({talent.length})</h3>
                <button onClick={openPicker} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">+ Add Talent</button>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
                {talent.length === 0 ? (
                  <div className="p-12 text-center text-zinc-400">No talent matched yet. Click <span className="font-medium">+ Add Talent</span> to pull people from your Talent pipelines.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 border-b border-zinc-200">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-zinc-700">Name</th>
                        <th className="text-left px-4 py-3 font-medium text-zinc-700">Location</th>
                        <th className="text-left px-4 py-3 font-medium text-zinc-700">License</th>
                        <th className="text-left px-4 py-3 font-medium text-zinc-700">Status</th>
                        <th className="text-right px-4 py-3 font-medium text-zinc-700"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {talent.map((t) => (
                        <tr key={t.id} className="border-b border-zinc-100">
                          <td className="px-4 py-3 text-zinc-900 font-medium whitespace-nowrap">{t.name}</td>
                          <td className="px-4 py-3 text-zinc-700">{[t.city, t.state].filter(Boolean).join(", ") || "—"}</td>
                          <td className="px-4 py-3 text-zinc-700 font-mono text-xs">{t.license_number || "—"}</td>
                          <td className="px-4 py-3">
                            <select value={t.match_status} onChange={(e) => changeMatchStatus(t.id, e.target.value)} className="text-xs font-medium border rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ color: matchMeta(t.match_status).color, borderColor: matchMeta(t.match_status).color + "55" }}>
                              {MATCH_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => removeTalent(t.id)} className="text-xs text-zinc-500 hover:text-red-500 transition">Remove</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      {showPicker && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={() => !adding && setShowPicker(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="p-5 border-b border-zinc-200">
              {openGroup ? (
                <div className="flex items-center gap-2">
                  <button onClick={() => { setOpenGroup(null); setSearch(""); }} className="text-sm text-zinc-500 hover:text-zinc-900">← Pipelines</button>
                  <h2 className="text-lg font-semibold text-zinc-900">{openGroup.pipelineName}</h2>
                </div>
              ) : (
                <h2 className="text-lg font-semibold text-zinc-900">Add talent — pick a pipeline</h2>
              )}
              {openGroup && (
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, business, city..." className="mt-3 w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-2">
              {optLoading ? <div className="p-8"><BrandLoader label="Loading talent..." /></div>
              : !openGroup ? (
                // Pipeline list
                groups.length === 0 ? <div className="p-8 text-center text-zinc-400 text-sm">No available talent in your Talent pipelines (or everyone is already in this pool).</div>
                : groups.map((g) => (
                  <div key={g.pipelineId} className="flex items-center justify-between px-3 py-3 rounded-lg hover:bg-zinc-50 transition">
                    <div>
                      <div className="text-sm font-medium text-zinc-900">🦷 {g.pipelineName}</div>
                      <div className="text-xs text-zinc-500">{g.options.length} available</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => addWholePipeline(g)} disabled={adding} className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-40">Add all</button>
                      <button onClick={() => { setOpenGroup(g); setPicked({}); setSearch(""); }} className="px-3 py-1.5 text-xs font-medium border border-zinc-300 text-zinc-700 rounded-lg hover:bg-zinc-100 transition">Choose</button>
                    </div>
                  </div>
                ))
              ) : (
                // Drill-in: individual people
                drillOptions.length === 0 ? <div className="p-8 text-center text-zinc-400 text-sm">No matching people.</div>
                : drillOptions.map((o) => {
                  const isSel = !!picked[o.rowId];
                  return (
                    <button key={o.rowId} onClick={() => togglePick(o)} className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition ${isSel ? "bg-blue-50" : "hover:bg-zinc-50"}`}>
                      <input type="checkbox" checked={isSel} readOnly className="h-4 w-4 rounded border-zinc-300 text-blue-600" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-zinc-900">{o.name}</div>
                        <div className="text-xs text-zinc-500">{[o.business, o.city, o.state].filter(Boolean).join(" · ")}</div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer — only in drill-in mode */}
            {openGroup && (
              <div className="p-4 border-t border-zinc-200 flex justify-between items-center">
                <span className="text-sm text-zinc-500">{Object.keys(picked).length} selected</span>
                <div className="flex gap-2">
                  <button onClick={() => setShowPicker(false)} disabled={adding} className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900 transition disabled:opacity-40">Cancel</button>
                  <button onClick={() => insertTalent(Object.values(picked))} disabled={adding || Object.keys(picked).length === 0} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-40">{adding ? "Adding..." : "Add selected"}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}