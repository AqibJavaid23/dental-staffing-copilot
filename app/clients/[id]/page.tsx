"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import BrandLoader from "@/app/components/BrandLoader";

type Client = {
  id: string; name: string;
  next_coaching_call: string | null;
  next_touch_date: string | null;
  next_touch_owner: string | null;
  next_touch_name: string | null;
  notes: string | null;
};
type Task = {
  id: string; title: string; description: string | null;
  urgency: string; deadline: string | null; status: string;
  assigned_to: string | null; created_at: string; completed_at: string | null;
};
type Activity = { id: string; actor_name: string | null; action: string; detail: string | null; created_at: string };
type Person = { id: string; full_name: string | null; email: string };

const URGENCY = {
  critical: { label: "Critical", dot: "#dc2626", bg: "#fef2f2", text: "#dc2626", emoji: "🔴" },
  high: { label: "High", dot: "#ea580c", bg: "#fff7ed", text: "#ea580c", emoji: "🟠" },
  medium: { label: "Medium", dot: "#d97706", bg: "#fffbeb", text: "#b45309", emoji: "🟡" },
  low: { label: "Low", dot: "#059669", bg: "#ecfdf5", text: "#059669", emoji: "🟢" },
};
const urg = (u: string) => URGENCY[u as keyof typeof URGENCY] || URGENCY.medium;
const STATUS_LABEL: Record<string, string> = { open: "Open", in_progress: "In Progress", completed: "Completed" };

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { profile, checking } = useAuth();

  const [client, setClient] = useState<Client | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // editable client fields
  const [coachingCall, setCoachingCall] = useState("");
  const [touchDate, setTouchDate] = useState("");
  const [touchOwner, setTouchOwner] = useState("");
  const [touchName, setTouchName] = useState("");
  const [notes, setNotes] = useState("");

  // new task form
  const [nt, setNt] = useState({ title: "", description: "", urgency: "medium", deadline: "", assigned_to: "" });

  const nameOf = (uid: string | null) => {
    if (!uid) return "—";
    const p = people.find((x) => x.id === uid);
    return p ? (p.full_name || p.email) : "Unknown";
  };
  const toLocalInput = (iso: string | null) => iso ? new Date(iso).toISOString().slice(0, 16) : "";

  const logActivity = async (action: string, detail: string, taskId?: string) => {
    if (!profile) return;
    await supabase.from("client_activity").insert({
      client_id: id, task_id: taskId || null, actor_id: profile.id,
      actor_name: profile.full_name || profile.email || "User", action, detail,
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data: c } = await supabase.from("clients").select("*").eq("id", id).single();
    if (c) {
      setClient(c);
      setCoachingCall(toLocalInput(c.next_coaching_call));
      setTouchDate(toLocalInput(c.next_touch_date));
      setTouchOwner(c.next_touch_owner || "");
      setTouchName(c.next_touch_name || "");
      setNotes(c.notes || "");
    }
    const { data: ts } = await supabase.from("client_tasks").select("*").eq("client_id", id).order("created_at", { ascending: false });
    setTasks((ts ?? []) as Task[]);
    const { data: acts } = await supabase.from("client_activity").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(30);
    setActivity((acts ?? []) as Activity[]);
    const { data: profs } = await supabase.from("profiles").select("id, full_name, email");
    setPeople((profs ?? []) as Person[]);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const saveClientFields = async () => {
    setSaving(true);
    await supabase.from("clients").update({
      next_coaching_call: coachingCall ? new Date(coachingCall).toISOString() : null,
      next_touch_date: touchDate ? new Date(touchDate).toISOString() : null,
      next_touch_owner: touchOwner || null,
      next_touch_name: touchName || null,
      notes: notes || null,
    }).eq("id", id);
    setSaving(false);
    load();
  };

  const addTask = async () => {
    if (!nt.title.trim() || !profile) { alert("Task needs a title."); return; }
    const { error } = await supabase.from("client_tasks").insert({
      client_id: id, title: nt.title.trim(), description: nt.description || null,
      urgency: nt.urgency, deadline: nt.deadline || null, assigned_to: nt.assigned_to || null,
      created_by: profile.id, status: "open",
    });
    if (error) { alert("Failed: " + error.message); return; }
    await logActivity("task_created", `created task: ${nt.title.trim()} (${nt.urgency})`);
    setNt({ title: "", description: "", urgency: "medium", deadline: "", assigned_to: "" });
    load();
  };

  const updateTask = async (taskId: string, patch: Partial<Task>) => {
    await supabase.from("client_tasks").update(patch).eq("id", taskId);
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
  };

  const setTaskStatus = async (task: Task, status: string) => {
    const patch: Partial<Task> = { status };
    if (status === "completed") patch.completed_at = new Date().toISOString();
    await updateTask(task.id, patch);
    await logActivity(status === "completed" ? "task_completed" : "task_updated", `${status === "completed" ? "completed" : "moved to " + STATUS_LABEL[status]}: ${task.title}`, task.id);
    load();
  };

  const deleteTask = async (task: Task) => {
    if (!confirm("Delete this task?")) return;
    await supabase.from("client_tasks").delete().eq("id", task.id);
    load();
  };

  if (checking || loading) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading..." /></div>;
  if (!client) return <div className="min-h-screen flex items-center justify-center bg-zinc-50 text-zinc-400">Client not found.</div>;

  const openTasks = tasks.filter((t) => t.status !== "completed");
  const doneTasks = tasks.filter((t) => t.status === "completed");
  // sort open by urgency then deadline
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  openTasks.sort((a, b) => (order[a.urgency as keyof typeof order] ?? 9) - (order[b.urgency as keyof typeof order] ?? 9));

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-5">
          <div className="flex items-center justify-between">
            <Link href="/clients" className="text-sm text-zinc-500 hover:text-zinc-900 transition">← All clients</Link>
            <Link href="/choose" className="text-sm text-zinc-500 hover:text-zinc-900 transition">⇄ Switch</Link>
          </div>

          <h1 className="text-3xl font-semibold" style={{ color: "var(--deep-navy)" }}>{client.name}</h1>

          {/* Client fields (the "tab") */}
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
            <h3 className="font-semibold text-zinc-900 mb-4">Client Overview</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">📞 Next coaching call (George)</label>
                <input type="datetime-local" value={coachingCall} onChange={(e) => setCoachingCall(e.target.value)} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">🤝 Next touch point — date</label>
                <input type="datetime-local" value={touchDate} onChange={(e) => setTouchDate(e.target.value)} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Touch point — owner</label>
                <select value={touchOwner} onChange={(e) => setTouchOwner(e.target.value)} className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                  <option value="">Choose team member...</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Touch point — call / interaction name</label>
                <input type="text" value={touchName} onChange={(e) => setTouchName(e.target.value)} placeholder="e.g. Weekly check-in" className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-zinc-500 mb-1">📝 Client notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="General notes about this client..." className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <button onClick={saveClientFields} disabled={saving} className="mt-3 px-4 py-2 text-sm font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition disabled:opacity-50">{saving ? "Saving..." : "Save Overview"}</button>
          </div>

          {/* Tasks */}
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
            <h3 className="font-semibold text-zinc-900 mb-4">Tasks</h3>

            {/* Add task */}
            <div className="border border-zinc-200 rounded-xl p-4 mb-4 bg-zinc-50/50">
              <input type="text" value={nt.title} onChange={(e) => setNt({ ...nt, title: e.target.value })} placeholder="Task title..." className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-teal-500" />
              <textarea value={nt.description} onChange={(e) => setNt({ ...nt, description: e.target.value })} rows={2} placeholder="Description / notes (optional)..." className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm mb-2 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500" />
              <div className="flex gap-2 flex-wrap items-center">
                <select value={nt.urgency} onChange={(e) => setNt({ ...nt, urgency: e.target.value })} className="text-sm border border-zinc-300 rounded-lg px-2 py-1.5 bg-white">
                  <option value="critical">🔴 Critical</option>
                  <option value="high">🟠 High</option>
                  <option value="medium">🟡 Medium</option>
                  <option value="low">🟢 Low</option>
                </select>
                <input type="date" value={nt.deadline} onChange={(e) => setNt({ ...nt, deadline: e.target.value })} className="text-sm border border-zinc-300 rounded-lg px-2 py-1.5" />
                <select value={nt.assigned_to} onChange={(e) => setNt({ ...nt, assigned_to: e.target.value })} className="text-sm border border-zinc-300 rounded-lg px-2 py-1.5 bg-white">
                  <option value="">Assign to...</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
                </select>
                <button onClick={addTask} className="px-4 py-1.5 text-sm font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition ml-auto">Add Task</button>
              </div>
            </div>

            {/* Open tasks */}
            {openTasks.length === 0 ? (
              <p className="text-sm text-zinc-400 italic mb-2">No open tasks.</p>
            ) : (
              <div className="space-y-2 mb-4">
                {openTasks.map((t) => {
                  const u = urg(t.urgency);
                  const overdue = t.deadline && new Date(t.deadline) < new Date(new Date().toDateString());
                  return (
                    <div key={t.id} className="rounded-lg border-l-4 p-3" style={{ borderLeftColor: u.dot, backgroundColor: u.bg }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-zinc-900 text-sm">{t.title}</div>
                          {t.description && <div className="text-xs text-zinc-600 mt-0.5">{t.description}</div>}
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[11px]">
                            <span className="font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: u.dot + "22", color: u.text }}>{u.emoji} {u.label}</span>
                            {t.deadline && <span className={overdue ? "text-red-600 font-semibold" : "text-zinc-500"}>{overdue ? "⚠ " : "📅 "}{new Date(t.deadline).toLocaleDateString()}</span>}
                            <span className="text-zinc-500">👤 {nameOf(t.assigned_to)}</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <select value={t.status} onChange={(e) => setTaskStatus(t, e.target.value)} className="text-[11px] border border-zinc-300 rounded px-1.5 py-0.5 bg-white">
                            <option value="open">Open</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                          </select>
                          <button onClick={() => deleteTask(t)} className="text-[11px] text-zinc-400 hover:text-red-500">delete</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Completed (task history) */}
            {doneTasks.length > 0 && (
              <details>
                <summary className="text-sm font-medium text-zinc-500 cursor-pointer">Completed ({doneTasks.length})</summary>
                <div className="space-y-1 mt-2">
                  {doneTasks.map((t) => (
                    <div key={t.id} className="text-xs flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-50">
                      <span className="line-through text-zinc-400">{t.title}</span>
                      <span className="text-zinc-400 ml-auto">{t.completed_at ? new Date(t.completed_at).toLocaleDateString() : ""}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          {/* Activity / history */}
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
            <h3 className="font-semibold text-zinc-900 mb-3">History</h3>
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
                      <span className="text-zinc-400 ml-1">· {new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
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