"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/app/lib/useAuth";
import { supabase } from "@/app/lib/supabase";
import { logEvent } from "@/app/lib/logEvent";
import BrandLoader from "@/app/components/BrandLoader";
import { Inbox, Plus, X, ArrowRight } from "lucide-react";

type Request = {
  id: string;
  org_id: string;
  service_id: string | null;
  title: string;
  details: string | null;
  channel: string;
  status: string;
  priority: string | null;
  created_at: string;
};
type LinkedWork = { id: string; title: string; status: string; request_id: string | null };
type Named = { id: string; name: string };

const CHANNELS = ["manual", "email", "phone", "portal"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const STATUS_TABS = [
  ["all", "All"], ["new", "New"], ["in_progress", "In Progress"],
  ["resolved", "Resolved"], ["closed", "Closed"], ["rejected", "Rejected"],
] as const;
const STATUS_LABEL: Record<string, string> = {
  new: "New", triaged: "Triaged", in_progress: "In Progress", resolved: "Resolved", closed: "Closed", rejected: "Rejected",
};
function statusStyle(s: string): { bg: string; color: string } {
  switch (s) {
    case "new": return { bg: "#e0edfb", color: "#1e4f9e" };
    case "in_progress": return { bg: "#fef3c7", color: "#92400e" };
    case "resolved": return { bg: "#dcfce7", color: "#166534" };
    case "closed": return { bg: "#f4f4f5", color: "#52525b" };
    case "rejected": return { bg: "#fee2e2", color: "#b91c1c" };
    default: return { bg: "#f4f4f5", color: "#52525b" };
  }
}

export default function RequestsPage() {
  const { profile, checking } = useAuth();
  const [requests, setRequests] = useState<Request[]>([]);
  const [linked, setLinked] = useState<LinkedWork[]>([]);
  const [services, setServices] = useState<Named[]>([]);
  const [orgs, setOrgs] = useState<Named[]>([]);
  const [defaultOrgId, setDefaultOrgId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("all");

  const [showForm, setShowForm] = useState(false);
  const [fTitle, setFTitle] = useState("");
  const [fDetails, setFDetails] = useState("");
  const [fOrg, setFOrg] = useState("");
  const [fChannel, setFChannel] = useState("manual");
  const [saving, setSaving] = useState(false);

  const [triageId, setTriageId] = useState<string | null>(null);
  const [tService, setTService] = useState("");
  const [tPriority, setTPriority] = useState("normal");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rq, sv, og] = await Promise.all([
        supabase.from("requests").select("*").order("created_at", { ascending: false }),
        supabase.from("services").select("id, name").eq("status", "active").order("sort_order").order("name"),
        supabase.from("organizations").select("id, name").order("name"),
      ]);
      if (rq.error) throw rq.error;
      const reqs = (rq.data ?? []) as Request[];
      setRequests(reqs);
      setServices((sv.data ?? []).map((s) => ({ id: s.id, name: s.name })));
      setOrgs((og.data ?? []).map((o) => ({ id: o.id, name: o.name })));

      const ids = reqs.map((r) => r.id);
      if (ids.length) {
        const { data: wi } = await supabase.from("work_items").select("id, title, status, request_id").in("request_id", ids);
        setLinked((wi ?? []) as LinkedWork[]);
      } else {
        setLinked([]);
      }

      let orgId = profile?.organization_id ?? "";
      if (!orgId) {
        const { data: org } = await supabase.from("organizations").select("id").eq("relationship", "internal").limit(1).maybeSingle();
        orgId = org?.id ?? "";
      }
      setDefaultOrgId(orgId);
      setFOrg((prev) => prev || orgId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { if (profile) load(); }, [profile, load]);

  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name || "—";
  const serviceName = (id: string | null) => services.find((s) => s.id === id)?.name || null;

  const createRequest = async () => {
    if (!fTitle.trim()) { alert("Give the request a title."); return; }
    const org = fOrg || defaultOrgId;
    if (!org) { alert("No organization to attach the request to."); return; }
    setSaving(true);
    try {
      const { data, error: e } = await supabase
        .from("requests")
        .insert({ org_id: org, title: fTitle.trim(), details: fDetails.trim() || null, channel: fChannel, status: "new", requested_by: profile?.id ?? null })
        .select().single();
      if (e) throw e;
      await logEvent({ verb: "request.created", entityType: "request", entityId: data.id, orgId: org, actorId: profile?.id ?? null });
      setShowForm(false); setFTitle(""); setFDetails(""); setFChannel("manual"); setFOrg(defaultOrgId);
      load();
    } catch (e) {
      alert("Failed to create: " + (e instanceof Error ? e.message : "unknown"));
    } finally { setSaving(false); }
  };

  const triage = async (req: Request) => {
    if (!tService) { alert("Pick a service."); return; }
    setBusy(req.id);
    try {
      const { data: wi, error: we } = await supabase
        .from("work_items")
        .insert({
          org_id: req.org_id, service_id: tService, title: req.title, description: req.details,
          priority: tPriority, source: "request", request_id: req.id, created_by: profile?.id ?? null,
        })
        .select().single();
      if (we) throw we;
      await logEvent({ verb: "work_item.created", entityType: "work_item", entityId: wi.id, orgId: req.org_id, actorId: profile?.id ?? null, metadata: { request_id: req.id } });

      const { error: ue } = await supabase.from("requests").update({ status: "in_progress", service_id: tService, priority: tPriority, updated_at: new Date().toISOString() }).eq("id", req.id);
      if (ue) throw ue;
      await logEvent({ verb: "request.triaged", entityType: "request", entityId: req.id, orgId: req.org_id, actorId: profile?.id ?? null, metadata: { service_id: tService, priority: tPriority } });

      setTriageId(null); setTService(""); setTPriority("normal");
      load();
    } catch (e) {
      alert("Triage failed: " + (e instanceof Error ? e.message : "unknown") + " (the request was left as New).");
    } finally { setBusy(null); }
  };

  const changeStatus = async (req: Request, next: string) => {
    if (next === req.status) return;
    setBusy(req.id);
    try {
      const { error: e } = await supabase.from("requests").update({ status: next, updated_at: new Date().toISOString() }).eq("id", req.id);
      if (e) throw e;
      await logEvent({ verb: "request.status_changed", entityType: "request", entityId: req.id, orgId: req.org_id, actorId: profile?.id ?? null, metadata: { from: req.status, to: next } });
      load();
    } catch (e) {
      alert("Failed: " + (e instanceof Error ? e.message : "unknown"));
    } finally { setBusy(null); }
  };

  if (checking) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading…" /></div>;

  const visible = tab === "all" ? requests : requests.filter((r) => r.status === tab);

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Inbox size={20} className="text-zinc-500" />
            <h1 className="text-xl font-semibold text-zinc-900">Requests</h1>
          </div>
          <button onClick={() => setShowForm((s) => !s)} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition">
            {showForm ? <X size={15} /> : <Plus size={15} />}{showForm ? "Close" : "New request"}
          </button>
        </div>
        <p className="text-sm text-zinc-500 mb-5">Capture an ask, then triage it into a work item tied to a service.</p>

        {showForm && (
          <div className="bg-white rounded-2xl border border-zinc-200 p-5 mb-6 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Organization</label>
                <select value={fOrg} onChange={(e) => setFOrg(e.target.value)} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Channel</label>
                <select value={fChannel} onChange={(e) => setFChannel(e.target.value)} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm capitalize focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Title</label>
              <input value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="What was asked for?" className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Details</label>
              <textarea value={fDetails} onChange={(e) => setFDetails(e.target.value)} rows={2} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex justify-end">
              <button onClick={createRequest} disabled={saving} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-40">{saving ? "Logging…" : "Log request"}</button>
            </div>
          </div>
        )}

        <div className="flex gap-1 mb-5 border-b border-zinc-200 overflow-x-auto">
          {STATUS_TABS.map(([val, label]) => (
            <button key={val} onClick={() => setTab(val)} className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 whitespace-nowrap transition ${tab === val ? "border-blue-600 text-blue-700" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}>{label}</button>
          ))}
        </div>

        {loading ? (
          <BrandLoader label="Loading…" />
        ) : error ? (
          <div className="bg-white rounded-2xl border border-zinc-200 p-8 text-center text-red-500">{error}</div>
        ) : visible.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-200 p-12 text-center text-zinc-400">No {tab === "all" ? "" : STATUS_LABEL[tab]?.toLowerCase() + " "}requests.</div>
        ) : (
          <div className="space-y-3">
            {visible.map((r) => {
              const st = statusStyle(r.status);
              const work = linked.filter((w) => w.request_id === r.id);
              return (
                <div key={r.id} className="bg-white rounded-2xl border border-zinc-200 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-zinc-900 min-w-0">{r.title}</h3>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: st.bg, color: st.color }}>{STATUS_LABEL[r.status] || r.status}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
                    <span>{orgName(r.org_id)}</span>
                    <span className="capitalize">· {r.channel}</span>
                    <span>· {new Date(r.created_at).toLocaleDateString()}</span>
                    {serviceName(r.service_id) && <span>· {serviceName(r.service_id)}</span>}
                    {r.priority && <span className="capitalize">· {r.priority} priority</span>}
                  </div>
                  {r.details && <p className="mt-2 text-sm text-zinc-600">{r.details}</p>}

                  {work.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {work.map((w) => (
                        <span key={w.id} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">🗒 {w.title} · {w.status}</span>
                      ))}
                    </div>
                  )}

                  {r.status === "new" ? (
                    triageId === r.id ? (
                      <div className="mt-3 border-t border-zinc-100 pt-3 flex flex-wrap items-end gap-2">
                        <div>
                          <label className="block text-[11px] text-zinc-500 mb-1">Service</label>
                          <select value={tService} onChange={(e) => setTService(e.target.value)} className="px-2 py-1.5 border border-zinc-300 rounded-lg text-sm focus:outline-none">
                            <option value="">— Select —</option>
                            {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] text-zinc-500 mb-1">Priority</label>
                          <select value={tPriority} onChange={(e) => setTPriority(e.target.value)} className="px-2 py-1.5 border border-zinc-300 rounded-lg text-sm capitalize focus:outline-none">
                            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>
                        <button onClick={() => triage(r)} disabled={busy === r.id} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-40">Create work item <ArrowRight size={14} /></button>
                        <button onClick={() => setTriageId(null)} className="px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-800">Cancel</button>
                      </div>
                    ) : (
                      <div className="mt-3">
                        <button onClick={() => { setTriageId(r.id); setTService(""); setTPriority("normal"); }} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition">Triage →</button>
                      </div>
                    )
                  ) : (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-xs text-zinc-400">Set status:</span>
                      <select value="" onChange={(e) => { if (e.target.value) changeStatus(r, e.target.value); }} disabled={busy === r.id} className="text-xs border border-zinc-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none">
                        <option value="">Change…</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}