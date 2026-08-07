"use client";

import { useEffect, useState, useCallback, use, Fragment } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import BrandLoader from "@/app/components/BrandLoader";
import { type EnrichmentRecord } from "@/app/lib/enrich";

type Pool = {
  id: string;
  company_name: string;
  job_title: string | null;
  city: string | null;
  state: string | null;
  job_url: string | null;
  notes: string | null;
  company_license: string | null;
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
  rowId: string; license_number: string; name: string; city: string; state: string; business: string; row_data: Record<string, string>;
};
type PipeGroup = { pipelineId: string; pipelineName: string; options: TalentOption[] };

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
  const [companyEnr, setCompanyEnr] = useState<EnrichmentRecord | null>(null);
  const [talentEnr, setTalentEnr] = useState<Record<string, EnrichmentRecord>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showPicker, setShowPicker] = useState(false);
  const [groups, setGroups] = useState<PipeGroup[]>([]);
  const [optLoading, setOptLoading] = useState(false);
  const [openGroup, setOpenGroup] = useState<PipeGroup | null>(null);
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
      const talentList = (t ?? []) as PoolTalent[];
      setTalent(talentList);

      if (p.company_license) {
        const { data: enr } = await supabase.from("enrichments").select("*").eq("license_number", p.company_license.trim()).maybeSingle();
        setCompanyEnr((enr as EnrichmentRecord) || null);
      } else { setCompanyEnr(null); }

      const licenses = talentList.map((x) => (x.license_number || "").trim()).filter(Boolean);
      if (licenses.length > 0) {
        const { data: enrs } = await supabase.from("enrichments").select("*").in("license_number", licenses);
        const map: Record<string, EnrichmentRecord> = {};
        (enrs ?? []).forEach((e) => { map[(e.license_number || "").trim()] = e as EnrichmentRecord; });
        setTalentEnr(map);
      } else { setTalentEnr({}); }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pool");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

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
          rowId: r.id, license_number: r.license_number || "",
          name: [d["First Name"], d["Last Name"]].filter(Boolean).join(" ") || "Unknown",
          city: d["City"] || "", state: d["State"] || "", business: d["Business Name"] || d["Office Name"] || "", row_data: d,
        });
      });
      const g: PipeGroup[] = talentPipes.map((p) => ({ pipelineId: p.id, pipelineName: p.name, options: byPipe[p.id] || [] })).filter((grp) => grp.options.length > 0);
      setGroups(g);
    } finally { setOptLoading(false); }
  };

  const openPicker = () => { setPicked({}); setSearch(""); setOpenGroup(null); setShowPicker(true); loadOptions(); };

  const insertTalent = async (opts: TalentOption[]) => {
    if (opts.length === 0) return;
    setAdding(true);
    try {
      const records = opts.map((o) => ({ pool_id: id, pipeline_row_id: o.rowId, license_number: o.license_number, name: o.name, city: o.city, state: o.state, row_data: o.row_data, match_status: "candidate" }));
      const { error } = await supabase.from("pool_talent").insert(records);
      if (error) throw error;
      setShowPicker(false); load();
    } catch (e) { alert("Failed to add talent: " + (e instanceof Error ? e.message : "unknown")); }
    finally { setAdding(false); }
  };

  const addWholePipeline = (g: PipeGroup) => {
    if (!confirm(`Add all ${g.options.length} people from "${g.pipelineName}" to this pool?`)) return;
    insertTalent(g.options);
  };
  const togglePick = (o: TalentOption) => { setPicked((prev) => { const n = { ...prev }; if (n[o.rowId]) delete n[o.rowId]; else n[o.rowId] = o; return n; }); };
  const removeTalent = async (tid: string) => { if (!confirm("Remove this person from the pool?")) return; await supabase.from("pool_talent").delete().eq("id", tid); load(); };
  const changeMatchStatus = async (tid: string, status: string) => { await supabase.from("pool_talent").update({ match_status: status }).eq("id", tid); setTalent((prev) => prev.map((t) => (t.id === tid ? { ...t, match_status: status } : t))); };

  const drillOptions = (openGroup?.options || []).filter((o) => {
    const s = search.trim().toLowerCase(); if (!s) return true;
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

              {/* Company Contact */}
              <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
                <h3 className="font-semibold text-zinc-900 mb-3">Company Contact</h3>
                {!pool.company_license ? (
                  <p className="text-sm text-zinc-400">This pool has no linked company row to enrich.</p>
                ) : !companyEnr ? (
                  <p className="text-sm text-zinc-400">Not enriched yet. Run G-Maps / NPPES / Find Person on this company in its hiring pipeline.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-zinc-500 uppercase">Practice (G-Maps)</div>
                      {companyEnr.matched_title && <div className="text-zinc-900">{companyEnr.matched_title}</div>}
                      {companyEnr.phone && <div className="text-zinc-700">📞 {companyEnr.phone}</div>}
                      {companyEnr.website && <div><a href={companyEnr.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">🌐 Website</a></div>}
                      {companyEnr.emails && companyEnr.emails.length > 0 && companyEnr.emails.map((em, i) => <div key={i} className="text-zinc-900 font-mono text-xs break-all">{em}</div>)}
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-zinc-500 uppercase">NPPES</div>
                      {companyEnr.npi_name && <div className="text-zinc-900">{companyEnr.npi_name}</div>}
                      {companyEnr.npi_number && <div className="text-zinc-700 font-mono text-xs">NPI: {companyEnr.npi_number}</div>}
                      {companyEnr.npi_specialty && <div className="text-zinc-600 text-xs">{companyEnr.npi_specialty}</div>}
                      {companyEnr.npi_address && <div className="text-zinc-600 text-xs">{companyEnr.npi_address}</div>}
                      {!companyEnr.npi_name && <div className="text-zinc-400 text-xs">Not looked up</div>}
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-zinc-500 uppercase">Decision-maker</div>
                      {companyEnr.person_linkedin_url ? (
                        <>
                          {companyEnr.person_headline && <div className="text-zinc-600 text-xs">{companyEnr.person_headline}</div>}
                          {companyEnr.person_email && <div className="text-zinc-900 font-mono text-xs break-all">{companyEnr.person_email}</div>}
                          <a href={companyEnr.person_linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">Open LinkedIn →</a>
                        </>
                      ) : <div className="text-zinc-400 text-xs">Use Find Person on the company row.</div>}
                    </div>
                  </div>
                )}
              </div>

              {/* Matched talent */}
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-zinc-900">Matched Talent ({talent.length})</h3>
                <button onClick={openPicker} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">+ Add Talent</button>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
                {talent.length === 0 ? (
                  <div className="p-12 text-center text-zinc-400">No talent matched yet. Click <span className="font-medium">+ Add Talent</span>.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 border-b border-zinc-200">
                      <tr>
                        <th className="px-4 py-3 w-8"></th>
                        <th className="text-left px-4 py-3 font-medium text-zinc-700">Name</th>
                        <th className="text-left px-4 py-3 font-medium text-zinc-700">Location</th>
                        <th className="text-left px-4 py-3 font-medium text-zinc-700">Contact</th>
                        <th className="text-left px-4 py-3 font-medium text-zinc-700">Status</th>
                        <th className="text-right px-4 py-3 font-medium text-zinc-700"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {talent.map((t) => {
                        const enr = talentEnr[(t.license_number || "").trim()];
                        const hasContact = enr && (enr.person_email || enr.person_linkedin_url || (enr.emails && enr.emails.length > 0) || enr.phone || enr.npi_name);
                        const isExp = expanded === t.id;
                        return (
                          <Fragment key={t.id}>
                            <tr className="border-b border-zinc-100">
                              <td className="px-4 py-3 text-center">{hasContact && <button onClick={() => setExpanded(isExp ? null : t.id)} className="text-zinc-400 hover:text-zinc-700">{isExp ? "▾" : "▸"}</button>}</td>
                              <td className="px-4 py-3 text-zinc-900 font-medium whitespace-nowrap">{t.name}</td>
                              <td className="px-4 py-3 text-zinc-700">{[t.city, t.state].filter(Boolean).join(", ") || "—"}</td>
                              <td className="px-4 py-3 text-xs">
                                {enr?.person_email ? <span className="text-zinc-900 font-mono">{enr.person_email}</span>
                                : enr?.emails && enr.emails.length > 0 ? <span className="text-zinc-700 font-mono">{enr.emails[0]}</span>
                                : hasContact ? <span className="text-zinc-400">expand →</span>
                                : <span className="text-zinc-300">not enriched</span>}
                              </td>
                              <td className="px-4 py-3">
                                <select value={t.match_status} onChange={(e) => changeMatchStatus(t.id, e.target.value)} className="text-xs font-medium border rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ color: matchMeta(t.match_status).color, borderColor: matchMeta(t.match_status).color + "55" }}>
                                  {MATCH_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                                </select>
                              </td>
                              <td className="px-4 py-3 text-right"><button onClick={() => removeTalent(t.id)} className="text-xs text-zinc-500 hover:text-red-500 transition">Remove</button></td>
                            </tr>
                            {isExp && enr && (
                              <tr className="bg-zinc-50/50">
                                <td colSpan={6} className="px-6 py-3">
                                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                                    <div>
                                      <div className="font-semibold text-zinc-500 uppercase mb-1">Person</div>
                                      {enr.person_email && <div className="text-zinc-900 font-mono break-all">✉️ {enr.person_email}</div>}
                                      {enr.person_linkedin_url && <a href={enr.person_linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Open LinkedIn →</a>}
                                      {!enr.person_email && !enr.person_linkedin_url && <div className="text-zinc-400">none</div>}
                                    </div>
                                    <div>
                                      <div className="font-semibold text-zinc-500 uppercase mb-1">NPPES</div>
                                      {enr.npi_name && <div className="text-zinc-900">{enr.npi_name}</div>}
                                      {enr.npi_specialty && <div className="text-zinc-600">{enr.npi_specialty}</div>}
                                      {enr.npi_number && <div className="text-zinc-700 font-mono">{enr.npi_number}</div>}
                                      {!enr.npi_name && <div className="text-zinc-400">none</div>}
                                    </div>
                                    <div>
                                      <div className="font-semibold text-zinc-500 uppercase mb-1">Practice</div>
                                      {enr.phone && <div className="text-zinc-700">📞 {enr.phone}</div>}
                                      {enr.website && <a href={enr.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">🌐 Website</a>}
                                      {!enr.phone && !enr.website && <div className="text-zinc-400">none</div>}
                                    </div>
                                    <div>
                                      <div className="font-semibold text-zinc-500 uppercase mb-1">Emails</div>
                                      {enr.emails && enr.emails.length > 0 ? enr.emails.map((em, i) => <div key={i} className="text-zinc-900 font-mono break-all">{em}</div>) : <div className="text-zinc-400">none</div>}
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
                )}
              </div>
            </>
          )}
        </div>
      </main>

      {showPicker && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={() => !adding && setShowPicker(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-zinc-200">
              {openGroup ? (
                <div className="flex items-center gap-2">
                  <button onClick={() => { setOpenGroup(null); setSearch(""); }} className="text-sm text-zinc-500 hover:text-zinc-900">← Pipelines</button>
                  <h2 className="text-lg font-semibold text-zinc-900">{openGroup.pipelineName}</h2>
                </div>
              ) : <h2 className="text-lg font-semibold text-zinc-900">Add talent — pick a pipeline</h2>}
              {openGroup && <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="mt-3 w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />}
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {optLoading ? <div className="p-8"><BrandLoader label="Loading talent..." /></div>
              : !openGroup ? (
                groups.length === 0 ? <div className="p-8 text-center text-zinc-400 text-sm">No available talent in your Talent pipelines.</div>
                : groups.map((g) => (
                  <div key={g.pipelineId} className="flex items-center justify-between px-3 py-3 rounded-lg hover:bg-zinc-50 transition">
                    <div><div className="text-sm font-medium text-zinc-900">🦷 {g.pipelineName}</div><div className="text-xs text-zinc-500">{g.options.length} available</div></div>
                    <div className="flex gap-2">
                      <button onClick={() => addWholePipeline(g)} disabled={adding} className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-40">Add all</button>
                      <button onClick={() => { setOpenGroup(g); setPicked({}); setSearch(""); }} className="px-3 py-1.5 text-xs font-medium border border-zinc-300 text-zinc-700 rounded-lg hover:bg-zinc-100 transition">Choose</button>
                    </div>
                  </div>
                ))
              ) : (
                drillOptions.length === 0 ? <div className="p-8 text-center text-zinc-400 text-sm">No matching people.</div>
                : drillOptions.map((o) => {
                  const isSel = !!picked[o.rowId];
                  return (
                    <button key={o.rowId} onClick={() => togglePick(o)} className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition ${isSel ? "bg-blue-50" : "hover:bg-zinc-50"}`}>
                      <input type="checkbox" checked={isSel} readOnly className="h-4 w-4 rounded border-zinc-300 text-blue-600" />
                      <div className="flex-1 min-w-0"><div className="text-sm font-medium text-zinc-900">{o.name}</div><div className="text-xs text-zinc-500">{[o.business, o.city, o.state].filter(Boolean).join(" · ")}</div></div>
                    </button>
                  );
                })
              )}
            </div>
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