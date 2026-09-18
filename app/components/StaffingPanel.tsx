"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/app/lib/supabase";

type Person = { id: string; full_name: string | null; email: string };
type Me = { id: string; full_name: string | null; email: string } | null;

type Role = {
  id: string; client_id: string; title: string; platforms: string | null;
  posting_status: string; blocker_note: string | null; owner_id: string | null; created_at: string;
};
type Candidate = {
  id: string; role_id: string; client_id: string; name: string;
  email: string | null; phone: string | null; resume_url: string | null;
  stage: string; promising: boolean; promising_note: string | null;
  referral_name: string | null; referral_contact: string | null; notes: string | null;
  owner_id: string | null; created_at: string;
};

const STAGES = [
  { key: "applied", label: "Applied" },
  { key: "screened", label: "Screened" },
  { key: "interviewed", label: "Interviewed" },
  { key: "offer", label: "Offer" },
  { key: "hired", label: "Hired" },
  { key: "declined", label: "Declined" },
];

const POSTING: Record<string, { label: string; color: string; bg: string }> = {
  not_posted: { label: "Not posted", color: "#6b7280", bg: "#f4f4f5" },
  live: { label: "Live", color: "#059669", bg: "#ecfdf5" },
  blocked: { label: "Blocked", color: "#dc2626", bg: "#fef2f2" },
  filled: { label: "Filled", color: "#2563eb", bg: "#eff6ff" },
  closed: { label: "Closed", color: "#71717a", bg: "#fafafa" },
};
const postStatus = (s: string) => POSTING[s] || POSTING.not_posted;

export default function StaffingPanel({
  clientId, clientName, people, me, open = true, onToggle,
}: {
  clientId: string; clientName: string; people: Person[]; me: Me; open?: boolean; onToggle?: () => void;
}) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [cands, setCands] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAddRole, setShowAddRole] = useState(false);

  const [nr, setNr] = useState({ title: "", platforms: "", posting_status: "not_posted", owner_id: "" });
  // new candidate form, keyed by role id
  const [nc, setNc] = useState<Record<string, { name: string; email: string; phone: string; referral_name: string; referral_contact: string }>>({});

  const nameOf = (uid: string | null) => {
    if (!uid) return "—";
    const p = people.find((x) => x.id === uid);
    return p ? (p.full_name || p.email) : "—";
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data: r } = await supabase.from("client_roles").select("*").eq("client_id", clientId).order("created_at", { ascending: false });
    setRoles((r ?? []) as Role[]);
    const { data: c } = await supabase.from("role_candidates").select("*").eq("client_id", clientId).order("created_at", { ascending: false });
    setCands((c ?? []) as Candidate[]);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const addRole = async () => {
    if (!nr.title.trim()) { alert("Give the role a title."); return; }
    const { error } = await supabase.from("client_roles").insert({
      client_id: clientId, title: nr.title.trim(), platforms: nr.platforms.trim() || null,
      posting_status: nr.posting_status, owner_id: nr.owner_id || null, created_by: me?.id || null,
    });
    if (error) { alert("Failed: " + error.message); return; }
    setNr({ title: "", platforms: "", posting_status: "not_posted", owner_id: "" });
    setShowAddRole(false);
    load();
  };

  const updateRole = async (id: string, patch: Partial<Role>) => {
    await supabase.from("client_roles").update(patch).eq("id", id);
    setRoles((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const deleteRole = async (r: Role) => {
    if (!confirm(`Delete the role "${r.title}" and all its candidates?`)) return;
    await supabase.from("client_roles").delete().eq("id", r.id);
    load();
  };

  const addCandidate = async (roleId: string) => {
    const form = nc[roleId] || { name: "", email: "", phone: "", referral_name: "", referral_contact: "" };
    if (!form.name.trim()) { alert("Candidate needs a name."); return; }
    const { error } = await supabase.from("role_candidates").insert({
      role_id: roleId, client_id: clientId, name: form.name.trim(),
      email: form.email.trim() || null, phone: form.phone.trim() || null,
      stage: "applied", promising: false,
      referral_name: form.referral_name.trim() || null, referral_contact: form.referral_contact.trim() || null,
      owner_id: me?.id || null, created_by: me?.id || null,
    });
    if (error) { alert("Failed: " + error.message); return; }
    setNc((prev) => ({ ...prev, [roleId]: { name: "", email: "", phone: "", referral_name: "", referral_contact: "" } }));
    load();
  };

  const setCandidate = async (id: string, patch: Partial<Candidate>) => {
    await supabase.from("role_candidates").update(patch).eq("id", id);
    setCands((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const deleteCandidate = async (id: string) => {
    if (!confirm("Remove this candidate?")) return;
    await supabase.from("role_candidates").delete().eq("id", id);
    setCands((prev) => prev.filter((c) => c.id !== id));
  };

  const candsFor = (roleId: string) => cands.filter((c) => c.role_id === roleId);
  const stageCount = (roleId: string, stage: string) => candsFor(roleId).filter((c) => c.stage === stage).length;

  // summary
  const livePostings = roles.filter((r) => r.posting_status === "live").length;
  const notPosted = roles.filter((r) => r.posting_status === "not_posted");
  const blockers = roles.filter((r) => r.posting_status === "blocked");
  const promising = cands.filter((c) => c.promising);

  const ncFor = (roleId: string) => nc[roleId] || { name: "", email: "", phone: "", referral_name: "", referral_contact: "" };
  const setNcField = (roleId: string, field: string, value: string) =>
    setNc((prev) => ({ ...prev, [roleId]: { ...ncFor(roleId), [field]: value } }));

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
      <button onClick={onToggle} className="w-full flex items-center justify-between text-left">
        <h3 className="font-semibold text-zinc-900">Staffing &amp; Recruiting</h3>
        <span className="text-zinc-400 text-sm">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
      <div className="mt-3">
      <div className="flex items-center justify-end mb-1">
        <button onClick={() => setShowAddRole((s) => !s)} className="text-sm font-medium text-teal-600 hover:text-teal-700 transition">{showAddRole ? "Cancel" : "+ Add role"}</button>
      </div>
      <p className="text-xs text-zinc-400 mb-4">Open roles at {clientName}, and where each candidate is in the pipeline.</p>

      {/* Summary chips */}
      <div className="flex gap-2 flex-wrap mb-4 text-[11px]">
        <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-medium">{livePostings} live posting{livePostings === 1 ? "" : "s"}</span>
        <span className="px-2 py-1 rounded-lg bg-zinc-100 text-zinc-600 font-medium">{cands.length} application{cands.length === 1 ? "" : "s"}</span>
        <span className="px-2 py-1 rounded-lg bg-amber-50 text-amber-700 font-medium">⭐ {promising.length} promising</span>
        {notPosted.length > 0 && <span className="px-2 py-1 rounded-lg bg-zinc-100 text-zinc-600 font-medium">{notPosted.length} not posted yet</span>}
        {blockers.length > 0 && <span className="px-2 py-1 rounded-lg bg-red-50 text-red-600 font-medium">⚠ {blockers.length} blocked</span>}
      </div>

      {/* Add role form */}
      {showAddRole && (
        <div className="border border-zinc-200 rounded-xl p-4 mb-4 bg-zinc-50/50 space-y-2">
          <input type="text" value={nr.title} onChange={(e) => setNr({ ...nr, title: e.target.value })} placeholder="Role title (e.g. Dental Hygienist)" className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          <input type="text" value={nr.platforms} onChange={(e) => setNr({ ...nr, platforms: e.target.value })} placeholder="Platforms (e.g. Indeed, LinkedIn)" className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          <div className="flex gap-2 flex-wrap items-center">
            <select value={nr.posting_status} onChange={(e) => setNr({ ...nr, posting_status: e.target.value })} className="text-sm border border-zinc-300 rounded-lg px-2 py-1.5 bg-white">
              {Object.keys(POSTING).map((k) => <option key={k} value={k}>{POSTING[k].label}</option>)}
            </select>
            <select value={nr.owner_id} onChange={(e) => setNr({ ...nr, owner_id: e.target.value })} className="text-sm border border-zinc-300 rounded-lg px-2 py-1.5 bg-white">
              <option value="">Owner...</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
            </select>
            <button onClick={addRole} className="px-4 py-1.5 text-sm font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition ml-auto">Add role</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-400 italic">Loading staffing...</p>
      ) : roles.length === 0 ? (
        <p className="text-sm text-zinc-400 italic">No roles yet. Click "+ Add role" to create the first one.</p>
      ) : (
        <div className="space-y-3">
          {roles.map((r) => {
            const ps = postStatus(r.posting_status);
            const roleCands = candsFor(r.id);
            const isOpen = expanded === r.id;
            const f = ncFor(r.id);
            return (
              <div key={r.id} className="border border-zinc-200 rounded-xl overflow-hidden">
                {/* Role header */}
                <div className="p-3 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-zinc-900 text-sm">{r.title}</span>
                      <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: ps.bg, color: ps.color }}>{ps.label}</span>
                      {r.platforms && <span className="text-[11px] text-zinc-500">{r.platforms}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-500 flex-wrap">
                      <span>👤 {nameOf(r.owner_id)}</span>
                      <span>· {roleCands.length} applicant{roleCands.length === 1 ? "" : "s"}</span>
                    </div>
                    {r.blocker_note && <div className="mt-1 text-[11px] text-red-600">⚠ {r.blocker_note}</div>}
                    {/* Stage counts */}
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {STAGES.map((s) => (
                        <span key={s.key} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600">{s.label} {stageCount(r.id, s.key)}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <select value={r.posting_status} onChange={(e) => updateRole(r.id, { posting_status: e.target.value })} className="text-[11px] border border-zinc-300 rounded px-1.5 py-0.5 bg-white">
                      {Object.keys(POSTING).map((k) => <option key={k} value={k}>{POSTING[k].label}</option>)}
                    </select>
                    <button onClick={() => setExpanded(isOpen ? null : r.id)} className="text-[11px] text-teal-600 hover:text-teal-700">{isOpen ? "Hide" : "Candidates"}</button>
                    <button onClick={() => deleteRole(r)} className="text-[11px] text-zinc-400 hover:text-red-500">delete</button>
                  </div>
                </div>

                {/* Blocker note editor (shown when blocked) */}
                {r.posting_status === "blocked" && (
                  <div className="px-3 pb-3">
                    <input
                      type="text"
                      defaultValue={r.blocker_note || ""}
                      onBlur={(e) => updateRole(r.id, { blocker_note: e.target.value.trim() || null })}
                      placeholder="What's the blocker? (e.g. Indeed verification issue) — saves when you click away"
                      className="w-full px-2 py-1.5 border border-red-200 rounded-lg text-[11px] bg-red-50/40 focus:outline-none focus:ring-1 focus:ring-red-300"
                    />
                  </div>
                )}

                {/* Candidates (expanded) */}
                {isOpen && (
                  <div className="border-t border-zinc-100 bg-zinc-50/40 p-3 space-y-2">
                    {/* Add candidate */}
                    <div className="bg-white border border-zinc-200 rounded-lg p-2 space-y-1.5">
                      <div className="flex gap-1.5 flex-wrap">
                        <input type="text" value={f.name} onChange={(e) => setNcField(r.id, "name", e.target.value)} placeholder="Candidate name" className="flex-1 min-w-[120px] px-2 py-1.5 border border-zinc-300 rounded text-[12px] focus:outline-none focus:ring-1 focus:ring-teal-500" />
                        <input type="text" value={f.email} onChange={(e) => setNcField(r.id, "email", e.target.value)} placeholder="Email" className="flex-1 min-w-[120px] px-2 py-1.5 border border-zinc-300 rounded text-[12px] focus:outline-none focus:ring-1 focus:ring-teal-500" />
                        <input type="text" value={f.phone} onChange={(e) => setNcField(r.id, "phone", e.target.value)} placeholder="Phone" className="w-24 px-2 py-1.5 border border-zinc-300 rounded text-[12px] focus:outline-none focus:ring-1 focus:ring-teal-500" />
                      </div>
                      <div className="flex gap-1.5 flex-wrap items-center">
                        <input type="text" value={f.referral_name} onChange={(e) => setNcField(r.id, "referral_name", e.target.value)} placeholder="Referred by (optional)" className="flex-1 min-w-[120px] px-2 py-1.5 border border-zinc-300 rounded text-[12px] focus:outline-none focus:ring-1 focus:ring-teal-500" />
                        <input type="text" value={f.referral_contact} onChange={(e) => setNcField(r.id, "referral_contact", e.target.value)} placeholder="Referrer contact (optional)" className="flex-1 min-w-[120px] px-2 py-1.5 border border-zinc-300 rounded text-[12px] focus:outline-none focus:ring-1 focus:ring-teal-500" />
                        <button onClick={() => addCandidate(r.id)} className="px-3 py-1.5 text-[12px] font-medium bg-teal-600 text-white rounded hover:bg-teal-700 transition ml-auto">Add</button>
                      </div>
                    </div>

                    {/* Candidate list */}
                    {roleCands.length === 0 ? (
                      <p className="text-[11px] text-zinc-400 italic">No candidates yet.</p>
                    ) : (
                      roleCands.map((c) => (
                        <div key={c.id} className="bg-white border border-zinc-200 rounded-lg p-2 flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <button onClick={() => setCandidate(c.id, { promising: !c.promising })} title="Flag as promising" className={c.promising ? "text-amber-500" : "text-zinc-300 hover:text-amber-400"}>★</button>
                              <span className="font-medium text-zinc-900 text-[12px]">{c.name}</span>
                            </div>
                            <div className="text-[11px] text-zinc-500 flex flex-wrap gap-x-2">
                              {c.email && <span>✉ {c.email}</span>}
                              {c.phone && <span>📞 {c.phone}</span>}
                              {c.referral_name && <span>↩ ref: {c.referral_name}</span>}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <select value={c.stage} onChange={(e) => setCandidate(c.id, { stage: e.target.value })} className="text-[11px] border border-zinc-300 rounded px-1.5 py-0.5 bg-white">
                              {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                            </select>
                            <button onClick={() => deleteCandidate(c.id)} className="text-[11px] text-zinc-400 hover:text-red-500">remove</button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>
      )}
    </div>
  );
}