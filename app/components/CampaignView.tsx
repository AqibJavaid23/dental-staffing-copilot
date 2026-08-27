"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import BrandLoader from "@/app/components/BrandLoader";

type Record = {
  id: string;
  name: string | null;
  license_number: string | null;
  chosen_phone: string | null;
  chosen_email: string | null;
  status: string;
  // options pulled from enrichment:
  phones?: string[];
  emails?: string[];
};

export default function CampaignView({ campaign }: { campaign: "sms" | "email" }) {
  const { profile, checking } = useAuth();
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    // Records for this campaign
    const { data: recs } = await supabase
      .from("prospecting_records")
      .select("*")
      .eq("owner_id", profile.id)
      .eq("campaign", campaign)
      .order("created_at", { ascending: false });

    const list = (recs ?? []) as Record[];

    // Pull enrichment contact options for each (by license_number)
    const licenses = [...new Set(list.map((r) => r.license_number).filter(Boolean))] as string[];
    const enrichMap: { [k: string]: { phones: string[]; emails: string[] } } = {};
    if (licenses.length > 0) {
      const { data: enr } = await supabase.from("enrichments").select("*").in("license_number", licenses);
      (enr ?? []).forEach((e) => {
        const phones = [e.phone, ...(e.extra_phones || []), e.npi_phone].filter(Boolean);
        const emails = [...(e.emails || []), e.person_email, e.person_email_company].filter(Boolean);
        enrichMap[e.license_number] = {
          phones: [...new Set(phones)] as string[],
          emails: [...new Set(emails)] as string[],
        };
      });
    }

    const enriched = list.map((r) => ({
      ...r,
      phones: r.license_number ? (enrichMap[r.license_number]?.phones || []) : [],
      emails: r.license_number ? (enrichMap[r.license_number]?.emails || []) : [],
    }));
    setRecords(enriched);
    setLoading(false);
  }, [profile, campaign]);

  useEffect(() => { if (profile) load(); }, [profile, load]);

  const choose = async (id: string, field: "chosen_phone" | "chosen_email", value: string) => {
    await supabase.from("prospecting_records").update({ [field]: value }).eq("id", id);
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const removeRecord = async (id: string) => {
    await supabase.from("prospecting_records").delete().eq("id", id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  if (checking || loading) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading..." /></div>;

  const title = campaign === "sms" ? "💬 SMS Campaign" : "✉️ Email Campaign";
  const isSms = campaign === "sms";

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-5">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold" style={{ color: "var(--deep-navy)" }}>{title}</h1>
            <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900 transition">← Dashboard</Link>
          </div>
          <p className="text-sm text-zinc-500">Prospects sent here from pipelines. Pick which {isSms ? "phone number" : "email"} to use for each.</p>

          {records.length === 0 ? (
            <div className="text-center py-16 text-zinc-400">
              No prospects yet. Send enriched rows here from a pipeline (the &quot;Prospecting&quot; button).
            </div>
          ) : (
            <div className="space-y-3">
              {records.map((r) => {
                const options = isSms ? (r.phones || []) : (r.emails || []);
                const chosen = isSms ? r.chosen_phone : r.chosen_email;
                const field = isSms ? "chosen_phone" : "chosen_email";
                return (
                  <div key={r.id} className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-zinc-900">{r.name || "Unknown"}</h3>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${r.status === "sent" ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}>{r.status}</span>
                        </div>

                        <label className="block text-xs font-medium text-zinc-500 mb-1">{isSms ? "Phone number" : "Email"} to use</label>
                        {options.length === 0 ? (
                          <p className="text-sm text-red-500">No {isSms ? "phone" : "email"} found in enrichment for this record.</p>
                        ) : (
                          <select
                            value={chosen || ""}
                            onChange={(e) => choose(r.id, field, e.target.value)}
                            className="w-full max-w-md px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Choose {isSms ? "a number" : "an email"}...</option>
                            {options.map((o, i) => <option key={i} value={o}>{o}</option>)}
                          </select>
                        )}
                      </div>
                      <button onClick={() => removeRecord(r.id)} className="text-zinc-400 hover:text-red-500 text-sm shrink-0">✕</button>
                    </div>

                    {chosen && (
                      <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center gap-2">
                        <span className="text-xs text-zinc-500">Selected: <span className="font-mono text-zinc-800">{chosen}</span></span>
                        <span className="ml-auto text-xs text-zinc-400 italic">Sending will be enabled once {isSms ? "SMS" : "email"} is connected.</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}