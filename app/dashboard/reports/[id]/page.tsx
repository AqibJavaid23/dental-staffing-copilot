"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import BrandLoader from "@/app/components/BrandLoader";

type Report = {
  id: string;
  owner_id: string;
  title: string;
  plan_text: string | null;
  kind: string;
  status: string;
  is_manager_task: boolean;
  manager_note: string | null;
  created_at: string;
};

type Item = {
  id: string;
  report_id: string;
  content: string;
  done: boolean;
  deadline: string | null;
  priority: string;
  sort_order: number;
};

const PRIORITY = {
  low: { label: "Low", classes: "bg-emerald-100 text-emerald-700", dot: "#059669" },
  mid: { label: "Mid", classes: "bg-amber-100 text-amber-700", dot: "#d97706" },
  high: { label: "High", classes: "bg-red-100 text-red-700", dot: "#dc2626" },
};
const prio = (p: string) => PRIORITY[p as keyof typeof PRIORITY] || PRIORITY.mid;

export default function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { profile, checking } = useAuth();

  const [report, setReport] = useState<Report | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [ownerName, setOwnerName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [planDraft, setPlanDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [managerNote, setManagerNote] = useState("");

  const isOwner = profile && report && profile.id === report.owner_id;
  const isManagerOrAdmin = profile?.role === "manager" || profile?.role === "admin";
  // Manager reviewing someone else's report (not their own task)
  const canReview = isManagerOrAdmin && report && !report.is_manager_task;
  // Manager building their own task
  const isOwnManagerTask = isManagerOrAdmin && report?.is_manager_task && isOwner;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data: r, error: rErr } = await supabase.from("reports").select("*").eq("id", id).single();
      if (rErr) throw rErr;
      setReport(r);
      setPlanDraft(r.plan_text || "");
      setManagerNote(r.manager_note || "");

      const { data: its } = await supabase.from("report_items").select("*").eq("report_id", id).order("sort_order");
      setItems((its ?? []) as Item[]);

      const { data: prof } = await supabase.from("profiles").select("full_name, email").eq("id", r.owner_id).maybeSingle();
      setOwnerName(prof?.full_name || prof?.email || "Unknown");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Member: save plan text
  const savePlan = async () => {
    setSaving(true);
    await supabase.from("reports").update({ plan_text: planDraft, updated_at: new Date().toISOString() }).eq("id", id);
    setSaving(false);
    load();
  };

  // Member: submit for review
  const submitReport = async () => {
    if (!planDraft.trim()) { alert("Write your plan first."); return; }
    setSaving(true);
    await supabase.from("reports").update({ plan_text: planDraft, status: "submitted", submitted_at: new Date().toISOString() }).eq("id", id);
    setSaving(false);
    load();
  };

  // Manager: add a checklist item
  const addItem = async () => {
    if (!newItem.trim()) return;
    const { error: e } = await supabase.from("report_items").insert({
      report_id: id, content: newItem.trim(), priority: "mid", sort_order: items.length,
    });
    if (e) { alert("Failed: " + e.message); return; }
    setNewItem("");
    load();
  };

  const updateItem = async (itemId: string, patch: Partial<Item>) => {
    await supabase.from("report_items").update(patch).eq("id", itemId);
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, ...patch } : it)));
  };

  const deleteItem = async (itemId: string) => {
    await supabase.from("report_items").delete().eq("id", itemId);
    load();
  };

  // Manager: approve (requires every item to have a deadline)
  const approve = async () => {
    if (items.length === 0) { alert("Add at least one checklist item before approving."); return; }
    const missingDeadline = items.some((it) => !it.deadline);
    if (missingDeadline) { alert("Every item needs a deadline before you can approve."); return; }
    setSaving(true);
    await supabase.from("reports").update({
      status: "approved", manager_note: managerNote || null,
      approved_at: new Date().toISOString(), approved_by: profile?.id,
    }).eq("id", id);
    setSaving(false);
    load();
  };

  // Member: toggle done
  const toggleDone = async (itemId: string, done: boolean) => {
    await supabase.from("report_items").update({ done: !done }).eq("id", itemId);
    const updated = items.map((it) => (it.id === itemId ? { ...it, done: !done } : it));
    setItems(updated);
    // Auto-complete the report when all items done
    if (updated.length > 0 && updated.every((it) => it.done)) {
      await supabase.from("reports").update({ status: "completed" }).eq("id", id);
      load();
    } else if (report?.status === "completed") {
      await supabase.from("reports").update({ status: "approved" }).eq("id", id);
      load();
    }
  };

  if (checking || loading) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading..." /></div>;
  if (error) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><div className="p-6 text-red-500 bg-red-50 rounded-lg">{error}</div></div>;
  if (!report) return <div className="min-h-screen flex items-center justify-center bg-zinc-50 text-zinc-400">Report not found.</div>;

  // Editing mode for building checklist = manager reviewing a submitted report, OR manager on their own task
  const canEditItems = (canReview && (report.status === "submitted" || report.status === "approved")) || isOwnManagerTask;
  const memberCanEditPlan = isOwner && !report.is_manager_task && (report.status === "draft");

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="flex justify-between items-center px-6 py-4 border-b border-zinc-200 bg-white">
        <Link href="/dashboard/reports" className="text-sm text-zinc-500 hover:text-zinc-900 transition">← All reports</Link>
        <h1 className="text-lg font-semibold text-zinc-900">Report</h1>
        <div className="w-20" />
      </header>

      <main className="flex-1 p-6">
        <div className="max-w-3xl mx-auto space-y-5">
          {/* Header card */}
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 uppercase">{report.status}</span>
              {report.is_manager_task && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">My Task</span>}
              {profile?.role !== "member" && <span className="text-xs text-zinc-500">{ownerName}</span>}
            </div>
            <h2 className="text-2xl font-semibold text-zinc-900">{report.title}</h2>
          </div>

          {/* Plan text — member writes here (not for manager's own tasks) */}
          {!report.is_manager_task && (
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
              <h3 className="font-semibold text-zinc-900 mb-3">The Plan</h3>
              {memberCanEditPlan ? (
                <>
                  <textarea value={planDraft} onChange={(e) => setPlanDraft(e.target.value)} rows={6}
                    placeholder="In plain English, describe what you plan to work on this week..."
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                  <div className="flex gap-2 mt-3">
                    <button onClick={savePlan} disabled={saving} className="px-4 py-2 text-sm font-medium border border-zinc-300 text-zinc-700 rounded-lg hover:bg-zinc-50 transition disabled:opacity-50">{saving ? "Saving..." : "Save Draft"}</button>
                    <button onClick={submitReport} disabled={saving} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50">Submit to Manager</button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-zinc-700 whitespace-pre-wrap">{report.plan_text || <span className="text-zinc-400 italic">No plan written.</span>}</p>
              )}
            </div>
          )}

          {/* Checklist */}
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
            <h3 className="font-semibold text-zinc-900 mb-3">Checklist</h3>

            {items.length === 0 ? (
              <p className="text-sm text-zinc-400 italic mb-3">{canEditItems ? "No items yet. Add tasks below." : "No checklist yet. Waiting for manager to build it."}</p>
            ) : (
              <div className="space-y-2 mb-3">
                {items.map((it) => {
                  const p = prio(it.priority);
                  const canCheck = isOwner && report.status === "approved";
                  return (
                    <div key={it.id} className="flex items-start gap-3 p-3 rounded-lg border border-zinc-100">
                      <input type="checkbox" checked={it.done} disabled={!canCheck} onChange={() => toggleDone(it.id, it.done)} className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-blue-600 disabled:opacity-40" />
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm ${it.done ? "line-through text-zinc-400" : "text-zinc-900"}`}>{it.content}</div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {canEditItems ? (
                            <>
                              <select value={it.priority} onChange={(e) => updateItem(it.id, { priority: e.target.value })} className="text-[11px] border rounded px-1.5 py-0.5 bg-white" style={{ color: p.dot }}>
                                <option value="low">Low</option><option value="mid">Mid</option><option value="high">High</option>
                              </select>
                              <input type="date" value={it.deadline || ""} onChange={(e) => updateItem(it.id, { deadline: e.target.value })} className="text-[11px] border border-zinc-300 rounded px-1.5 py-0.5" />
                              <button onClick={() => deleteItem(it.id)} className="text-[11px] text-zinc-400 hover:text-red-500">remove</button>
                            </>
                          ) : (
                            <>
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${p.classes}`}>{p.label}</span>
                              {it.deadline && <span className="text-[11px] text-zinc-500">📅 {new Date(it.deadline).toLocaleDateString()}</span>}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {canEditItems && (
              <div className="flex gap-2">
                <input type="text" value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem()} placeholder="Add a checklist item..." className="flex-1 px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button onClick={addItem} className="px-4 py-2 text-sm font-medium bg-zinc-800 text-white rounded-lg hover:bg-zinc-900 transition">Add</button>
              </div>
            )}
          </div>

          {/* Manager review actions (only when reviewing someone's submitted/approved report) */}
          {canReview && (report.status === "submitted" || report.status === "approved") && (
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
              <h3 className="font-semibold text-zinc-900 mb-3">Manager Review</h3>
              <textarea value={managerNote} onChange={(e) => setManagerNote(e.target.value)} rows={2} placeholder="Optional note to the member..." className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-3" />
              <button onClick={approve} disabled={saving} className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-50">
                {report.status === "approved" ? "Re-approve / Update" : "Approve Checklist"}
              </button>
              <p className="text-xs text-zinc-400 mt-2">Every item needs a deadline before approving.</p>
            </div>
          )}

          {report.manager_note && report.status === "approved" && !canReview && (
            <div className="bg-blue-50 rounded-2xl border border-blue-100 p-4">
              <div className="text-xs font-semibold text-blue-700 mb-1">Note from your manager</div>
              <p className="text-sm text-zinc-700">{report.manager_note}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}