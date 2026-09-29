"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/app/lib/useAuth";
import { supabase } from "@/app/lib/supabase";
import { logEvent } from "@/app/lib/logEvent";
import BrandLoader from "@/app/components/BrandLoader";
import { ListTodo, Plus, X } from "lucide-react";

type WorkItem = {
  id: string;
  org_id: string;
  service_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  created_at: string;
};
type Assignment = { id: string; work_item_id: string; assignee_type: string; assignee_id: string };
type Named = { id: string; name: string };

const STATUSES = ["open", "in_progress", "blocked", "done", "cancelled"] as const;
const STATUS_LABEL: Record<string, string> = { open: "Open", in_progress: "In Progress", blocked: "Blocked", done: "Done", cancelled: "Cancelled" };
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

function priorityStyle(p: string): { bg: string; color: string } {
  switch (p) {
    case "urgent": return { bg: "#fee2e2", color: "#b91c1c" };
    case "high": return { bg: "#ffedd5", color: "#c2410c" };
    case "low": return { bg: "#f4f4f5", color: "#71717a" };
    default: return { bg: "#e0edfb", color: "#1e4f9e" };
  }
}

export default function WorkPage() {
  const { profile, checking } = useAuth();
  const [items, setItems] = useState<WorkItem[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [services, setServices] = useState<Named[]>([]);
  const [people, setPeople] = useState<Named[]>([]);
  const [teams, setTeams] = useState<Named[]>([]);
  const [internalOrgId, setInternalOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [fService, setFService] = useState("");
  const [fTitle, setFTitle] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fPriority, setFPriority] = useState("normal");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [wi, sv, pf, gp] = await Promise.all([
        supabase.from("work_items").select("*").order("created_at", { ascending: false }),
        supabase.from("services").select("id, name").eq("status", "active").order("sort_order").order("name"),
        supabase.from("profiles").select("id, full_name, email"),
        supabase.from("groups").select("id, name"),
      ]);
      if (wi.error) throw wi.error;
      const workItems = (wi.data ?? []) as WorkItem[];
      setItems(workItems);
      setServices((sv.data ?? []).map((s) => ({ id: s.id, name: s.name })));
      setPeople((pf.data ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email || "Unknown" })));
      setTeams((gp.data ?? []).map((g) => ({ id: g.id, name: g.name })));

      const ids = workItems.map((w) => w.id);
      if (ids.length) {
        const { data: asg } = await supabase.from("work_assignments").select("*").in("work_item_id", ids);
        setAssignments((asg ?? []) as Assignment[]);
      } else {
        setAssignments([]);
      }

      let orgId = profile?.organization_id ?? null;
      if (!orgId) {
        const { data: org } = await supabase.from("organizations").select("id").eq("relationship", "internal").limit(1).maybeSingle();
        orgId = org?.id ?? null;
      }
      setInternalOrgId(orgId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { if (profile) load(); }, [profile, load]);

  const serviceName = (id: string | null) => services.find((s) => s.id === id)?.name || "—";
  const assigneeName = (a: Assignment) =>
    a.assignee_type === "team"
      ? (teams.find((t) => t.id === a.assignee_id)?.name || "Team")
      : (people.find((p) => p.id === a.assignee_id)?.name || "User");

  const createItem = async () => {
    if (!fTitle.trim()) { alert("Give the work item a title."); return; }
    if (!fService) { alert("Pick a service."); return; }
    if (!internalOrgId) { alert("No organization found to attach this work to."); return; }
    setSaving(true);
    try {
      const { data, error: e } = await supabase
        .from("work_items")
        .insert({
          org_id: internalOrgId,
          service_id: fService,
          title: fTitle.trim(),
          description: fDesc.trim() || null,
          priority: fPriority,
          source: "manual",
          created_by: profile?.id ?? null,
        })
        .select()
        .single();
      if (e) throw e;
      await logEvent({ verb: "work_item.created", entityType: "work_item", entityId: data.id, orgId: internalOrgId, actorId: profile?.id ?? null });
      setShowForm(false);
      setFService(""); setFTitle(""); setFDesc(""); setFPriority("normal");
      load();
    } catch (e) {
      alert("Failed to create: " + (e instanceof Error ? e.message : "unknown"));
    } finally {
      setSaving(false);
    }
  };

  const addAssignment = async (item: WorkItem, value: string) => {
    if (!value) return;
    const [assignee_type, assignee_id] = value.split(":");
    try {
      const { error: e } = await supabase.from("work_assignments").insert({
        work_item_id: item.id, assignee_type, assignee_id, is_primary: true,
      });
      if (e) throw e;
      await logEvent({ verb: "work_item.assigned", entityType: "work_item", entityId: item.id, orgId: item.org_id, actorId: profile?.id ?? null, metadata: { assignee_type, assignee_id } });
      load();
    } catch (e) {
      alert("Failed to assign: " + (e instanceof Error ? e.message : "unknown"));
    }
  };

  const changeStatus = async (item: WorkItem, next: string) => {
    if (next === item.status) return;
    try {
      const { error: e } = await supabase.from("work_items").update({ status: next, updated_at: new Date().toISOString() }).eq("id", item.id);
      if (e) throw e;
      await logEvent({ verb: "work_item.status_changed", entityType: "work_item", entityId: item.id, orgId: item.org_id, actorId: profile?.id ?? null, metadata: { from: item.status, to: next } });
      load();
    } catch (e) {
      alert("Failed to update status: " + (e instanceof Error ? e.message : "unknown"));
    }
  };

  if (checking) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading…" /></div>;

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <ListTodo size={20} className="text-zinc-500" />
            <h1 className="text-xl font-semibold text-zinc-900">Work</h1>
          </div>
          <button onClick={() => setShowForm((s) => !s)} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition">
            {showForm ? <X size={15} /> : <Plus size={15} />}{showForm ? "Close" : "New work item"}
          </button>
        </div>
        <p className="text-sm text-zinc-500 mb-5">Internal and cross-service work, tied to a service and assignable to a person or a team.</p>

        {showForm && (
          <div className="bg-white rounded-2xl border border-zinc-200 p-5 mb-6 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Service</label>
                <select value={fService} onChange={(e) => setFService(e.target.value)} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Select service —</option>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Priority</label>
                <select value={fPriority} onChange={(e) => setFPriority(e.target.value)} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm capitalize focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Title</label>
              <input value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="What needs doing?" className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Description</label>
              <textarea value={fDesc} onChange={(e) => setFDesc(e.target.value)} rows={2} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex justify-end">
              <button onClick={createItem} disabled={saving} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-40">{saving ? "Creating…" : "Create work item"}</button>
            </div>
          </div>
        )}

        {loading ? (
          <BrandLoader label="Loading…" />
        ) : error ? (
          <div className="bg-white rounded-2xl border border-zinc-200 p-8 text-center text-red-500">{error}</div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-200 p-12 text-center text-zinc-400">No work items yet. Create the first one above.</div>
        ) : (
          <div className="space-y-3">
            {items.map((it) => {
              const rowAssignees = assignments.filter((a) => a.work_item_id === it.id);
              const pr = priorityStyle(it.priority);
              return (
                <div key={it.id} className="bg-white rounded-2xl border border-zinc-200 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-wide text-zinc-400">{serviceName(it.service_id)}</div>
                      <h3 className="font-semibold text-zinc-900 mt-0.5">{it.title}</h3>
                      {it.description && <p className="text-sm text-zinc-500 mt-1">{it.description}</p>}
                    </div>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize shrink-0" style={{ backgroundColor: pr.bg, color: pr.color }}>{it.priority}</span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select value={it.status} onChange={(e) => changeStatus(it, e.target.value)} className="text-xs font-medium border border-zinc-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none">
                      {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>

                    {rowAssignees.map((a) => (
                      <span key={a.id} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                        {a.assignee_type === "team" ? "👥 " : ""}{assigneeName(a)}
                      </span>
                    ))}

                    <select value="" onChange={(e) => { addAssignment(it, e.target.value); e.target.value = ""; }} className="text-xs border border-zinc-300 rounded-lg px-2 py-1.5 bg-white text-zinc-600 focus:outline-none">
                      <option value="">＋ Assign…</option>
                      <optgroup label="People">
                        {people.map((p) => <option key={p.id} value={`user:${p.id}`}>{p.name}</option>)}
                      </optgroup>
                      <optgroup label="Teams">
                        {teams.map((t) => <option key={t.id} value={`team:${t.id}`}>{t.name}</option>)}
                      </optgroup>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}