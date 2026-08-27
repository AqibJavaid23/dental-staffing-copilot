"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import Papa from "papaparse";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import BrandLoader from "@/app/components/BrandLoader";

type Step = { step_order: number; delay_days: number; message: string };
type Enrollment = {
  id: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  phone: string | null;
  current_step: number;
  status: string;
  source: string;
};

const STATUS_STYLE: Record<string, string> = {
  active: "bg-blue-100 text-blue-700",
  replied: "bg-emerald-100 text-emerald-700",
  completed: "bg-zinc-100 text-zinc-600",
  stopped: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
};

export default function SequenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { profile, checking } = useAuth();
  const [seqName, setSeqName] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
    const [preview, setPreview] = useState<Enrollment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: seq } = await supabase.from("sequences").select("*").eq("id", id).single();
    setSeqName(seq?.name || "Sequence");
    const { data: st } = await supabase.from("sequence_steps").select("*").eq("sequence_id", id).order("step_order");
    setSteps((st ?? []) as Step[]);
    const { data: en } = await supabase.from("sequence_enrollments").select("*").eq("sequence_id", id).order("enrolled_at", { ascending: false });
    setEnrollments((en ?? []) as Enrollment[]);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setUploading(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data as Record<string, string>[];
          const records = rows.map((r) => {
            // flexible: accept common column name variants
            const first = r.first_name || r.First_Name || r["First Name"] || r.firstname || "";
            const last = r.last_name || r.Last_Name || r["Last Name"] || r.lastname || "";
            const phone = r.phone || r.Phone || r.phone_number || r["Phone Number"] || r.mobile || "";
            const job = r.job_title || r["Job Title"] || r.title || r.occupation || "";
            return {
              sequence_id: id,
              owner_id: profile.id,
              first_name: first || null,
              last_name: last || null,
              name: `${first} ${last}`.trim() || null,
              job_title: job || null,
              phone: phone || null,
              source: "upload",
              current_step: 0,
              status: "active",
            };
          }).filter((r) => r.phone); // only rows with a phone
          if (records.length === 0) { alert("No rows with a phone number found. Check your CSV has a 'phone' column."); setUploading(false); return; }
          const { error } = await supabase.from("sequence_enrollments").insert(records);
          if (error) throw error;
          alert(`Enrolled ${records.length} prospect(s).`);
          load();
        } catch (err) {
          alert("Failed: " + (err instanceof Error ? err.message : "unknown"));
        } finally { setUploading(false); e.target.value = ""; }
      },
    });
  };

    const mergeMessage = (msg: string, en: Enrollment) => {
    return msg
      .replace(/\{first_name\}/g, en.first_name || "there")
      .replace(/\{last_name\}/g, en.last_name || "")
      .replace(/\{name\}/g, en.name || "there")
      .replace(/\{job_title\}/g, en.job_title || "")
      .replace(/\{occupation\}/g, en.job_title || "");
  };
  const removeEnrollment = async (eid: string) => {
    await supabase.from("sequence_enrollments").delete().eq("id", eid);
    setEnrollments((prev) => prev.filter((x) => x.id !== eid));
  };

  if (checking || loading) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading..." /></div>;

  const counts = {
    active: enrollments.filter((e) => e.status === "active").length,
    replied: enrollments.filter((e) => e.status === "replied").length,
    completed: enrollments.filter((e) => e.status === "completed").length,
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <Link href="/dashboard/prospecting/sequences" className="text-sm text-zinc-500 hover:text-zinc-900 transition">← All sequences</Link>
              <h1 className="text-2xl font-semibold mt-1" style={{ color: "var(--deep-navy)" }}>{seqName}</h1>
              <p className="text-xs text-zinc-400 mt-0.5">{steps.length} steps · {enrollments.length} enrolled</p>
            </div>
          </div>

          {/* Stat chips */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl p-4 bg-blue-50 border border-blue-100"><div className="text-2xl font-bold text-blue-700">{counts.active}</div><div className="text-xs text-zinc-600">Active</div></div>
            <div className="rounded-xl p-4 bg-emerald-50 border border-emerald-100"><div className="text-2xl font-bold text-emerald-700">{counts.replied}</div><div className="text-xs text-zinc-600">Replied</div></div>
            <div className="rounded-xl p-4 bg-zinc-50 border border-zinc-200"><div className="text-2xl font-bold text-zinc-600">{counts.completed}</div><div className="text-xs text-zinc-600">Completed</div></div>
          </div>

          {/* Enroll via CSV */}
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
            <h3 className="font-semibold text-zinc-900 mb-1">Enroll prospects (CSV)</h3>
            <p className="text-xs text-zinc-400 mb-3">Columns: first_name, last_name, phone, job_title. Only rows with a phone are enrolled.</p>
            <label className="inline-block px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition cursor-pointer">
              {uploading ? "Uploading..." : "Upload CSV"}
              <input type="file" accept=".csv" onChange={handleCsv} className="hidden" disabled={uploading} />
            </label>
          </div>

          {/* Board */}
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-x-auto pretty-scroll">
            {enrollments.length === 0 ? (
              <div className="p-10 text-center text-zinc-400">No prospects enrolled yet. Upload a CSV above.</div>
            ) : (
              <table className="w-full text-sm min-w-[600px]">
                <thead className="border-b border-zinc-200">
                  <tr className="text-left text-xs text-zinc-500 uppercase">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Job Title</th>
                    <th className="px-4 py-3">Step</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map((en) => (
                    <tr key={en.id} className="border-b border-zinc-50">
                      <td className="px-4 py-3 font-medium text-zinc-900"><button onClick={() => setPreview(en)} className="text-blue-600 hover:underline">{en.name || "—"}</button></td>
                      <td className="px-4 py-3 text-zinc-600 font-mono text-xs">{en.phone || "—"}</td>
                      <td className="px-4 py-3 text-zinc-600">{en.job_title || "—"}</td>
                      <td className="px-4 py-3 text-zinc-600">{steps.length ? `${en.current_step + 1} / ${steps.length}` : "—"}</td>
                      <td className="px-4 py-3"><span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_STYLE[en.status] || STATUS_STYLE.active}`}>{en.status}</span></td>
                      <td className="px-4 py-3 text-right"><button onClick={() => removeEnrollment(en.id)} className="text-xs text-zinc-400 hover:text-red-500">remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <p className="text-xs text-zinc-400 text-center italic">Actual SMS sending will run automatically once Twilio is connected.</p>
        </div>
      </main>
   
          {preview && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPreview(null)}>
              <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="px-5 py-3 border-b border-zinc-200 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-zinc-900">{preview.name || "Prospect"}</h3>
                    <p className="text-xs text-zinc-400">{preview.phone} · {preview.job_title || "—"}</p>
                  </div>
                  <button onClick={() => setPreview(null)} className="text-zinc-400 hover:text-zinc-900">✕</button>
                </div>
                <div className="flex-1 overflow-y-auto pretty-scroll p-4 space-y-3">
                  <p className="text-xs text-zinc-500">Messages this prospect will receive:</p>
                  {steps.length === 0 ? (
                    <p className="text-sm text-zinc-400 italic">This sequence has no steps yet.</p>
                  ) : steps.map((s, i) => (
                    <div key={i} className="border border-zinc-200 rounded-xl p-3">
                      <div className="text-[11px] text-zinc-400 mb-1">Step {i + 1} · {i === 0 ? "immediately" : `+${s.delay_days} day(s)`}</div>
                      <div className="text-sm text-zinc-800 whitespace-pre-wrap bg-green-50 rounded-lg p-2 border border-green-100">{mergeMessage(s.message, preview)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
    </div>
  );
}