"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import BrandLoader from "@/app/components/BrandLoader";
import ItemComments from "@/app/components/ItemComments";
import { notify } from "@/app/lib/notify";

type Report = {
  id: string;
  owner_id: string;
  title: string;
  plan_text: string | null;
  kind: string;
  status: string;
  is_manager_task: boolean;
  manager_note: string | null;
  submitted_to: string | null;
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

type Activity = {
  id: string;
  actor_name: string | null;
  action: string;
  detail: string | null;
  created_at: string;
};

// An AI-proposed task carries its own priority + deadline while being reviewed
type AiTask = { content: string; priority: string; deadline: string };

const PRIORITY = {
  low: { label: "Low", classes: "bg-emerald-100 text-emerald-700", dot: "#059669" },
  mid: { label: "Mid", classes: "bg-amber-100 text-amber-700", dot: "#d97706" },
  high: { label: "High", classes: "bg-red-100 text-red-700", dot: "#dc2626" },
};
const prio = (p: string) => PRIORITY[p as keyof typeof PRIORITY] || PRIORITY.mid;

function fmtActivity(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { profile, checking } = useAuth();

  const [report, setReport] = useState<Report | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [ownerName, setOwnerName] = useState("");
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [planDraft, setPlanDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [managerNote, setManagerNote] = useState("");
  const [managers, setManagers] = useState<{ id: string; full_name: string | null; email: string }[]>([]);
  const [submitTo, setSubmitTo] = useState("");

  // Build mode: "manual" or "ai"
  const [buildMode, setBuildMode] = useState<"manual" | "ai">("manual");
  const [aiTasks, setAiTasks] = useState<AiTask[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiNewTask, setAiNewTask] = useState("");

  const isOwner = profile && report && profile.id === report.owner_id;
  const isManagerOrAdmin = profile?.role === "manager" || profile?.role === "admin";
  const canReview = isManagerOrAdmin && report && !report.is_manager_task;
  const isOwnManagerTask = report?.is_manager_task && isOwner;

  const logActivity = async (action: string, detail: string) => {
    if (!profile) return;
    await supabase.from("report_activity").insert({
      report_id: id,
      actor_id: profile.id,
      actor_name: profile.full_name || profile.email || "User",
      action,
      detail,
    });
  };

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

      // Load all managers + admins for the submit-to dropdown
      const { data: mgrs } = await supabase.from("profiles").select("id, full_name, email").in("role", ["manager", "admin"]);
      setManagers((mgrs ?? []) as { id: string; full_name: string | null; email: string }[]);
      if (r.submitted_to) setSubmitTo(r.submitted_to);

      const { data: acts } = await supabase.from("report_activity").select("*").eq("report_id", id).order("created_at", { ascending: false });
      setActivity((acts ?? []) as Activity[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const savePlan = async () => {
    setSaving(true);
    await supabase.from("reports").update({ plan_text: planDraft, updated_at: new Date().toISOString() }).eq("id", id);
    setSaving(false);
    load();
  };

  const submitReport = async () => {
    if (!planDraft.trim()) { alert("Write your plan first."); return; }
    if (!submitTo) { alert("Choose who to submit this to (a manager or admin)."); return; }
    setSaving(true);
    // Clean the English via AI before submitting
    let cleaned = planDraft;
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "clean", text: planDraft }),
      });
      const data = await res.json();
      if (res.ok && data.result) cleaned = data.result;
    } catch {
      // If AI fails, just submit the original text
    }
    await supabase.from("reports").update({
      plan_text: cleaned, status: "submitted", submitted_at: new Date().toISOString(), submitted_to: submitTo,
    }).eq("id", id);
    setPlanDraft(cleaned);
    const mgrName = managers.find((m) => m.id === submitTo);
    await logActivity("submitted", `submitted the plan to ${mgrName?.full_name || mgrName?.email || "a manager"}`);
    if (submitTo) {
      await notify(
        submitTo,
        `${profile?.full_name || profile?.email || "A member"} submitted a plan for your review: "${report?.title || "Report"}"`,
        `/dashboard/reports/${id}`,
        "submitted",
        profile?.full_name || profile?.email || undefined
      );
    }
    setSaving(false);
    load();
  };

  // AI: turn the plan paragraph into proposed tasks (each gets default priority + empty deadline)
  const generateTasks = async () => {
    if (!report?.plan_text?.trim()) { alert("No plan text to generate from."); return; }
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "tasks", text: report.plan_text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI failed");
      const tasks: AiTask[] = (data.tasks || []).map((t: string) => ({ content: t, priority: "mid", deadline: "" }));
      setAiTasks(tasks);
    } catch (e) {
      alert("Failed to generate tasks: " + (e instanceof Error ? e.message : "unknown"));
    } finally { setAiLoading(false); }
  };

  const updateAiTask = (i: number, patch: Partial<AiTask>) => {
    setAiTasks((prev) => prev.map((t, xi) => (xi === i ? { ...t, ...patch } : t)));
  };

  // Create the reviewed AI tasks as actual checklist items (with their priority + deadline)
  const createTasksFromAi = async () => {
    if (aiTasks.length === 0) { alert("No tasks to create."); return; }
    if (aiTasks.some((t) => !t.content.trim())) { alert("Every task needs text."); return; }
    setSaving(true);
    try {
      const rows = aiTasks.map((t, i) => ({
        report_id: id,
        content: t.content.trim(),
        priority: t.priority || "mid",
        deadline: t.deadline || null,
        sort_order: items.length + i,
      }));
      const { error: e } = await supabase.from("report_items").insert(rows);
      if (e) throw e;
      await logActivity("item_added", `generated ${aiTasks.length} task(s) with AI`);
      setAiTasks([]);
      load();
    } catch (e) {
      alert("Failed to create tasks: " + (e instanceof Error ? e.message : "unknown"));
    } finally { setSaving(false); }
  };

  const addItem = async () => {
    if (!newItem.trim()) return;
    const label = newItem.trim();
    const { error: e } = await supabase.from("report_items").insert({
      report_id: id, content: label, priority: "mid", sort_order: items.length,
    });
    if (e) { alert("Failed: " + e.message); return; }
    await logActivity("item_added", `added a task: ${label}`);
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

  const approve = async () => {
    if (items.length === 0) { alert("Add at least one checklist item before approving."); return; }
    const missingDeadline = items.some((it) => !it.deadline);
    if (missingDeadline) { alert("Every item needs a deadline before you can approve."); return; }
    setSaving(true);
    await supabase.from("reports").update({
      status: "approved", manager_note: managerNote || null,
      approved_at: new Date().toISOString(), approved_by: profile?.id,
    }).eq("id", id);
    await logActivity("approved", "approved the checklist");
    if (report?.owner_id && report.owner_id !== profile?.id) {
      await notify(
        report.owner_id,
        `Your plan "${report.title}" was approved by ${profile?.full_name || profile?.email || "your manager"}. Your checklist is ready.`,
        `/dashboard/reports/${id}`,
        "approved",
        profile?.full_name || profile?.email || undefined
      );
    }
    setSaving(false);
    load();
  };

  const toggleDone = async (itemId: string, done: boolean) => {
    await supabase.from("report_items").update({ done: !done }).eq("id", itemId);
    const updated = items.map((it) => (it.id === itemId ? { ...it, done: !done } : it));
    setItems(updated);
    if (!done) {
      const it = updated.find((x) => x.id === itemId);
      await logActivity("item_completed", `completed: ${it?.content ?? "a task"}`);
    }
    if (updated.length > 0 && updated.every((it) => it.done)) {
      await supabase.from("reports").update({ status: "completed" }).eq("id", id);
      await logActivity("completed", "completed the whole report");
      if (report?.submitted_to && report.submitted_to !== profile?.id) {
        await notify(
          report.submitted_to,
          `${profile?.full_name || profile?.email || "A member"} completed all tasks in "${report.title}".`,
          `/dashboard/reports/${id}`,
          "completed",
          profile?.full_name || profile?.email || undefined
        );
      }
      load();
    } else if (report?.status === "completed") {
      await supabase.from("reports").update({ status: "approved" }).eq("id", id);
      load();
    } else {
      load();
    }
  };

  if (checking || loading) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading..." /></div>;
  if (error) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><div className="p-6 text-red-500 bg-red-50 rounded-lg">{error}</div></div>;
  if (!report) return <div className="min-h-screen flex items-center justify-center bg-zinc-50 text-zinc-400">Report not found.</div>;

  const canEditItems = (canReview && (report.status === "submitted" || report.status === "approved")) || isOwnManagerTask;
  const memberCanEditPlan = isOwner && !report.is_manager_task && (report.status === "draft");
  // Show the build tools (manual/AI) when the reviewer/owner can edit items and there is a plan to work from
  const showBuildTools = canEditItems;

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

          {/* Plan text */}
          {!report.is_manager_task && (
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
              <h3 className="font-semibold text-zinc-900 mb-3">The Plan</h3>
              {memberCanEditPlan ? (
                <>
                  <textarea value={planDraft} onChange={(e) => setPlanDraft(e.target.value)} rows={6}
                    placeholder="In plain English, describe what you plan to work on this week..."
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Submit to</label>
                    <select value={submitTo} onChange={(e) => setSubmitTo(e.target.value)} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Choose a manager or admin...</option>
                      {managers.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={savePlan} disabled={saving} className="px-4 py-2 text-sm font-medium border border-zinc-300 text-zinc-700 rounded-lg hover:bg-zinc-50 transition disabled:opacity-50">{saving ? "Saving..." : "Save Draft"}</button>
                    <button onClick={submitReport} disabled={saving} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50">Submit</button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-zinc-700 whitespace-pre-wrap">{report.plan_text || <span className="text-zinc-400 italic">No plan written.</span>}</p>
              )}
            </div>
          )}

          {/* Build the checklist — Manual vs AI (only for reviewer/owner who can edit) */}
          {showBuildTools && (
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
              <h3 className="font-semibold text-zinc-900 mb-3">Build the Checklist</h3>

              {/* Two-button choice */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setBuildMode("manual")}
                  className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg border transition ${buildMode === "manual" ? "bg-zinc-800 text-white border-zinc-800" : "bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50"}`}
                >
                  ✍️ Build Manually
                </button>
                <button
                  onClick={() => setBuildMode("ai")}
                  className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg border transition ${buildMode === "ai" ? "bg-violet-600 text-white border-violet-600" : "bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50"}`}
                >
                  ✨ Use AI
                </button>
              </div>

              {/* MANUAL mode: add a single item */}
              {buildMode === "manual" && (
                <div>
                  <p className="text-xs text-zinc-400 mb-2">Type each task and add it. Set priority + deadline on each in the Checklist below.</p>
                  <div className="flex gap-2">
                    <input type="text" value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem()} placeholder="Add a checklist item..." className="flex-1 px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button onClick={addItem} className="px-4 py-2 text-sm font-medium bg-zinc-800 text-white rounded-lg hover:bg-zinc-900 transition">Add</button>
                  </div>
                </div>
              )}

              {/* AI mode: generate, then review with priority + deadline per task */}
              {buildMode === "ai" && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-zinc-400">Reads the plan above and proposes tasks. Set priority + deadline, edit, add or remove — then create them.</p>
                    <button onClick={generateTasks} disabled={aiLoading} className="px-3 py-1.5 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition disabled:opacity-50 shrink-0">
                      {aiLoading ? "Generating..." : "✨ Generate Tasks"}
                    </button>
                  </div>

                  {aiTasks.length > 0 && (
                    <div className="space-y-2 mt-3">
                      {aiTasks.map((t, i) => {
                        const p = prio(t.priority);
                        return (
                          <div key={i} className="border border-zinc-200 rounded-lg p-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={t.content}
                                onChange={(e) => updateAiTask(i, { content: e.target.value })}
                                className="flex-1 px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                              />
                              <button onClick={() => setAiTasks((prev) => prev.filter((_, xi) => xi !== i))} className="text-xs text-zinc-400 hover:text-red-500 px-2 shrink-0">remove</button>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <select value={t.priority} onChange={(e) => updateAiTask(i, { priority: e.target.value })} className="text-[11px] border rounded px-1.5 py-1 bg-white" style={{ color: p.dot }}>
                                <option value="low">Low</option><option value="mid">Mid</option><option value="high">High</option>
                              </select>
                              <input type="date" value={t.deadline} onChange={(e) => updateAiTask(i, { deadline: e.target.value })} className="text-[11px] border border-zinc-300 rounded px-1.5 py-1" />
                              <span className="text-[11px] text-zinc-400">{t.deadline ? "" : "set a deadline"}</span>
                            </div>
                          </div>
                        );
                      })}

                      <div className="flex gap-2 pt-1">
                        <input
                          type="text"
                          value={aiNewTask}
                          onChange={(e) => setAiNewTask(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && aiNewTask.trim()) { setAiTasks((prev) => [...prev, { content: aiNewTask.trim(), priority: "mid", deadline: "" }]); setAiNewTask(""); } }}
                          placeholder="Add another task..."
                          className="flex-1 px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                        <button onClick={() => { if (aiNewTask.trim()) { setAiTasks((prev) => [...prev, { content: aiNewTask.trim(), priority: "mid", deadline: "" }]); setAiNewTask(""); } }} className="px-3 py-2 text-sm font-medium border border-zinc-300 text-zinc-700 rounded-lg hover:bg-zinc-50 transition">Add</button>
                      </div>

                      <button onClick={createTasksFromAi} disabled={saving} className="mt-2 px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-50">
                        {saving ? "Creating..." : `Create ${aiTasks.length} Task(s) as Checklist`}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Checklist */}
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
            <h3 className="font-semibold text-zinc-900 mb-3">Checklist</h3>

            {items.length === 0 ? (
              <p className="text-sm text-zinc-400 italic mb-3">{canEditItems ? "No items yet. Use the tools above to add tasks." : "No checklist yet. Waiting for manager to build it."}</p>
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
                        {profile && <ItemComments itemId={it.id} reportId={report.id} authorId={profile.id} authorName={profile.full_name || profile.email || "User"} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Manager review */}
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

          {/* Activity timeline */}
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
            <h3 className="font-semibold text-zinc-900 mb-3">Activity</h3>
            {activity.length === 0 ? (
              <p className="text-sm text-zinc-400 italic">No activity yet.</p>
            ) : (
              <ol className="space-y-2">
                {activity.map((a) => (
                  <li key={a.id} className="text-xs flex items-start gap-2">
                    <span className="text-zinc-300 mt-0.5">•</span>
                    <div>
                      <span className="font-medium text-zinc-700">{a.actor_name || "Someone"}</span>
                      <span className="text-zinc-600"> {a.detail || a.action}</span>
                      <span className="text-zinc-400 ml-1">· {fmtActivity(a.created_at)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}