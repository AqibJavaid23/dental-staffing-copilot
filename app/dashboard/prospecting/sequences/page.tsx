"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import BrandLoader from "@/app/components/BrandLoader";

type Step = { id?: string; step_order: number; delay_days: number; message: string };
type Sequence = { id: string; name: string; active: boolean; created_at: string; stepCount?: number; enrollCount?: number };

const MERGE_FIELDS = ["{first_name}", "{last_name}", "{name}", "{job_title}", "{occupation}"];

export default function SequencesPage() {
  const { profile, checking } = useAuth();
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null); // sequence id being edited
  const [newName, setNewName] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data: seqs } = await supabase.from("sequences").select("*").eq("owner_id", profile.id).order("created_at", { ascending: false });
    const withMeta: Sequence[] = await Promise.all((seqs ?? []).map(async (s) => {
      const { count: sc } = await supabase.from("sequence_steps").select("*", { count: "exact", head: true }).eq("sequence_id", s.id);
      const { count: ec } = await supabase.from("sequence_enrollments").select("*", { count: "exact", head: true }).eq("sequence_id", s.id);
      return { ...s, stepCount: sc ?? 0, enrollCount: ec ?? 0 };
    }));
    setSequences(withMeta);
    setLoading(false);
  }, [profile]);

  useEffect(() => { if (profile) load(); }, [profile, load]);

  const startNew = () => {
    setEditing("new");
    setNewName("");
    setSteps([{ step_order: 0, delay_days: 0, message: "" }]);
  };

  const editExisting = async (seq: Sequence) => {
    setEditing(seq.id);
    setNewName(seq.name);
    const { data: st } = await supabase.from("sequence_steps").select("*").eq("sequence_id", seq.id).order("step_order");
    setSteps((st ?? []).map((s) => ({ id: s.id, step_order: s.step_order, delay_days: s.delay_days, message: s.message })));
  };

  const addStep = () => setSteps((prev) => [...prev, { step_order: prev.length, delay_days: 2, message: "" }]);
  const removeStep = (i: number) => setSteps((prev) => prev.filter((_, x) => x !== i).map((s, x) => ({ ...s, step_order: x })));
  const updateStep = (i: number, patch: Partial<Step>) => setSteps((prev) => prev.map((s, x) => (x === i ? { ...s, ...patch } : s)));

  const insertMerge = (i: number, field: string) => {
    updateStep(i, { message: (steps[i].message || "") + field });
  };

  const saveSequence = async () => {
    if (!newName.trim()) { alert("Name the sequence."); return; }
    if (steps.some((s) => !s.message.trim())) { alert("Every step needs a message."); return; }
    setSaving(true);
    try {
      let seqId = editing;
      if (editing === "new") {
        const { data, error } = await supabase.from("sequences").insert({ owner_id: profile!.id, name: newName.trim() }).select().single();
        if (error) throw error;
        seqId = data.id;
      } else {
        await supabase.from("sequences").update({ name: newName.trim() }).eq("id", editing);
        // clear old steps, re-insert (simplest reliable way)
        await supabase.from("sequence_steps").delete().eq("sequence_id", editing);
      }
      const rows = steps.map((s, i) => ({ sequence_id: seqId, step_order: i, delay_days: s.delay_days, message: s.message.trim() }));
      await supabase.from("sequence_steps").insert(rows);
      setEditing(null);
      load();
    } catch (e) {
      alert("Failed: " + (e instanceof Error ? e.message : "unknown"));
    } finally { setSaving(false); }
  };

  const deleteSequence = async (id: string) => {
    if (!confirm("Delete this sequence and its enrollments?")) return;
    await supabase.from("sequences").delete().eq("id", id);
    load();
  };

  if (checking || loading) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading..." /></div>;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <main className="flex-1 p-6">
        <div className="max-w-3xl mx-auto space-y-5">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold" style={{ color: "var(--deep-navy)" }}>SMS Sequences</h1>
            <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900 transition">← Dashboard</Link>
          </div>

          {editing ? (
            /* ---- Builder ---- */
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6 space-y-4">
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Sequence name (e.g. Dentist Outreach)" className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

              <div className="space-y-3">
                {steps.map((s, i) => (
                  <div key={i} className="border border-zinc-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-zinc-700">Step {i + 1}</span>
                      {steps.length > 1 && <button onClick={() => removeStep(i)} className="text-xs text-zinc-400 hover:text-red-500">remove</button>}
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <label className="text-xs text-zinc-500">{i === 0 ? "Send immediately" : "Send after"}</label>
                      {i > 0 && (
                        <>
                          <input type="number" min={0} value={s.delay_days} onChange={(e) => updateStep(i, { delay_days: parseInt(e.target.value) || 0 })} className="w-16 px-2 py-1 border border-zinc-300 rounded text-sm" />
                          <span className="text-xs text-zinc-500">days (after previous step)</span>
                        </>
                      )}
                    </div>
                    <textarea value={s.message} onChange={(e) => updateStep(i, { message: e.target.value })} rows={3} placeholder="Message... use merge fields below" className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <div className="flex flex-wrap gap-1 mt-2">
                      {MERGE_FIELDS.map((f) => (
                        <button key={f} onClick={() => insertMerge(i, f)} className="text-[11px] px-2 py-0.5 bg-zinc-100 text-zinc-600 rounded hover:bg-zinc-200 transition">{f}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={addStep} className="text-sm text-blue-600 hover:underline">+ Add step</button>

              <div className="flex gap-2 pt-2 border-t border-zinc-100">
                <button onClick={saveSequence} disabled={saving} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50">{saving ? "Saving..." : "Save Sequence"}</button>
                <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm font-medium border border-zinc-300 text-zinc-700 rounded-lg hover:bg-zinc-50 transition">Cancel</button>
              </div>
            </div>
          ) : (
            /* ---- List ---- */
            <>
              <button onClick={startNew} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">+ New Sequence</button>
              {sequences.length === 0 ? (
                <div className="text-center py-16 text-zinc-400">No sequences yet. Create one to start.</div>
              ) : (
                <div className="space-y-3">
                  {sequences.map((s) => (
                    <div key={s.id} className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5 flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-zinc-900">{s.name}</h3>
                        <p className="text-xs text-zinc-400 mt-0.5">{s.stepCount} steps · {s.enrollCount} enrolled</p>
                      </div>
                      <div className="flex gap-2">
                        <Link href={`/dashboard/prospecting/sequences/${s.id}`} className="text-sm text-blue-600 hover:underline">Open</Link>
                        <button onClick={() => editExisting(s)} className="text-sm text-blue-600 hover:underline">Edit</button>
                        <button onClick={() => deleteSequence(s.id)} className="text-sm text-zinc-400 hover:text-red-500">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}