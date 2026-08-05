"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import { searchJobs, type JobPosting } from "@/app/lib/enrich";
import BrandLoader from "@/app/components/BrandLoader";

// Platform config — add new platforms here (actor + which filters they support)
const PLATFORMS = [
  {
    id: "linkedin",
    label: "LinkedIn",
    available: true,
    filters: ["title", "location", "datePosted", "contractType", "experienceLevel", "remote", "limit"],
  },
  { id: "indeed", label: "Indeed", available: true, filters: ["title", "location", "fromDays", "limit"] },
  { id: "ziprecruiter", label: "ZipRecruiter", available: false, filters: [] },
];

const DATE_OPTIONS = ["", "Past 24 hours", "Past week", "Past month"];
const FROMDAYS_OPTIONS = [{ v: "1", l: "Past 24 hours" }, { v: "7", l: "Past week" }, { v: "14", l: "Past 2 weeks" }, { v: "30", l: "Past month" }];
const CONTRACT_OPTIONS = ["", "Full-time", "Part-time", "Contract", "Temporary", "Internship"];
const EXP_OPTIONS = ["", "Internship", "Entry level", "Associate", "Mid-Senior level", "Director", "Executive"];
const REMOTE_OPTIONS = ["", "On-site", "Remote", "Hybrid"];

export default function JobsPage() {
  const router = useRouter();
  const { profile, checking } = useAuth();

  const [platform, setPlatform] = useState("linkedin");
  const activePlatform = PLATFORMS.find((p) => p.id === platform) || PLATFORMS[0];
  const has = (f: string) => activePlatform.filters.includes(f);

  const [title, setTitle] = useState("General Dentist");
  const [location, setLocation] = useState("Arizona");
  const [datePosted, setDatePosted] = useState("");
  const [contractType, setContractType] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");
  const [remote, setRemote] = useState("");
  const [limit, setLimit] = useState(50);
  const [fromDays, setFromDays] = useState("14");
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const [selected, setSelected] = useState<Record<string, JobPosting>>({});
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [pipelineName, setPipelineName] = useState("");
  const [saving, setSaving] = useState(false);

  const runSearch = async () => {
    if (!activePlatform.available) return;
    setLoading(true); setError(null); setSearched(true); setSelected({});
    try {
      const results = await searchJobs(
        { platform, title, location, datePosted, contractType, experienceLevel, remote, fromDays, limit },
        { onProgress: (s) => setStage(s) }
      );
      setJobs(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setJobs([]);
    } finally { setLoading(false); setStage(""); }
  };

  const toggle = (j: JobPosting) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[j.id]) delete next[j.id]; else next[j.id] = j;
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
        .insert({ name: pipelineName.trim(), source_tab: "Jobs", project: "DSCP", owner_id: profile.id, pipeline_type: "hiring" })
        .select().single();
      if (pErr) throw pErr;

      const rowsToInsert = Object.values(selected).map((j) => {
        const [city, st] = j.location.split(",").map((s) => s.trim());
        return {
          pipeline_id: pipeline.id,
          license_number: `JOB::${j.id}`,
          row_data: {
            "First Name": "",
            "Last Name": "",
            "Business Name": j.company,
            "City": city || "",
            "State": st || "",
            "License Number": "",
            "Job Title": j.title,
            "Job URL": j.url,
            "Posted": j.postedTimeAgo,
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
        <h1 className="text-lg font-semibold text-zinc-900">Job Postings</h1>
        <Link href="/pipelines" className="text-sm text-blue-600 hover:underline">Pipelines →</Link>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row">
        {/* LEFT PANEL — filters */}
        <aside className="lg:w-80 shrink-0 border-r border-zinc-200 bg-white p-5 space-y-5">
          {/* Platform switcher */}
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Source</label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => p.available && setPlatform(p.id)}
                  disabled={!p.available}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition ${
                    platform === p.id ? "text-white border-transparent" : "bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50"
                  } ${!p.available ? "opacity-40 cursor-not-allowed" : ""}`}
                  style={platform === p.id ? { backgroundColor: "var(--brand-blue)" } : {}}
                  title={p.available ? "" : "Coming soon"}
                >
                  {p.label}{!p.available && " (soon)"}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-zinc-100 pt-4 space-y-4">
            {has("title") && (
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Job title</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. General Dentist" />
              </div>
            )}
            {has("location") && (
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Location</label>
                <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Arizona" />
              </div>
            )}
            {has("datePosted") && (
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Date posted</label>
                <select value={datePosted} onChange={(e) => setDatePosted(e.target.value)} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {DATE_OPTIONS.map((o) => <option key={o} value={o}>{o || "Any time"}</option>)}
                </select>
              </div>
            )}
            {has("fromDays") && (
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Date posted</label>
                <select value={fromDays} onChange={(e) => setFromDays(e.target.value)} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {FROMDAYS_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
            )}
            {has("contractType") && (
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Contract type</label>
                <select value={contractType} onChange={(e) => setContractType(e.target.value)} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {CONTRACT_OPTIONS.map((o) => <option key={o} value={o}>{o || "Any"}</option>)}
                </select>
              </div>
            )}
            {has("experienceLevel") && (
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Experience level</label>
                <select value={experienceLevel} onChange={(e) => setExperienceLevel(e.target.value)} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {EXP_OPTIONS.map((o) => <option key={o} value={o}>{o || "Any"}</option>)}
                </select>
              </div>
            )}
            {has("remote") && (
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Remote</label>
                <select value={remote} onChange={(e) => setRemote(e.target.value)} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {REMOTE_OPTIONS.map((o) => <option key={o} value={o}>{o || "Any"}</option>)}
                </select>
              </div>
            )}
            {has("limit") && (
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Results limit</label>
                <input type="number" value={limit} min={10} max={200} onChange={(e) => setLimit(parseInt(e.target.value) || 50)} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}

            <button onClick={runSearch} disabled={loading || !activePlatform.available} className="w-full py-2.5 text-white font-medium rounded-lg hover:opacity-90 transition disabled:opacity-50" style={{ backgroundColor: "var(--brand-blue)" }}>
              {loading ? "Searching..." : "Search Jobs"}
            </button>
          </div>
        </aside>

        {/* RIGHT — results */}
        <section className="flex-1 p-6 pb-32">
          {error ? <div className="p-8 text-center text-red-500">{error}</div>
          : loading ? <BrandLoader label={stage || "Searching jobs..."} />
          : !searched ? <div className="p-12 text-center text-zinc-400">Set your filters on the left and click Search Jobs.</div>
          : jobs.length === 0 ? <div className="p-12 text-center text-zinc-400">No jobs found. Try broadening your filters.</div>
          : (
            <div className="space-y-3">
              <div className="text-sm text-zinc-500">{jobs.length} job{jobs.length === 1 ? "" : "s"} found</div>
              {jobs.map((j, idx) => {
                const isSel = !!selected[j.id];
                return (
                  <div key={`${j.id}-${idx}`} onClick={() => toggle(j)} className={`bg-white rounded-xl border p-4 cursor-pointer transition ${isSel ? "border-blue-400 bg-blue-50/40" : "border-zinc-200 hover:shadow-sm"}`}>
                    <div className="flex items-start gap-3">
                      <input type="checkbox" checked={isSel} onChange={() => toggle(j)} onClick={(e) => e.stopPropagation()} className="mt-1 h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500" />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-zinc-900">{j.title}</h3>
                        <p className="text-sm text-zinc-700">{j.company}{j.location ? ` · ${j.location}` : ""}</p>
                        <div className="flex flex-wrap gap-2 mt-2 text-xs text-zinc-500">
                          {j.contractType && <span className="px-2 py-0.5 bg-zinc-100 rounded">{j.contractType}</span>}
                          {j.experienceLevel && j.experienceLevel !== "Not Applicable" && <span className="px-2 py-0.5 bg-zinc-100 rounded">{j.experienceLevel}</span>}
                          {j.postedTimeAgo && <span className="px-2 py-0.5 bg-zinc-100 rounded">{j.postedTimeAgo}</span>}
                        </div>
                        {j.url && <a href={j.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-sm text-blue-600 hover:underline mt-2 inline-block">View posting →</a>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

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
            <p className="text-sm text-zinc-500">Saving {selectedCount} job lead{selectedCount === 1 ? "" : "s"} (practices) to a new pipeline.</p>
            <input type="text" placeholder="e.g., Arizona Hiring Practices" value={pipelineName} onChange={(e) => setPipelineName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") savePipeline(); }} autoFocus className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
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