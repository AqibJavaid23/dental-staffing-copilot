"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/lib/useAuth";
import { supabase } from "@/app/lib/supabase";
import BrandLoader from "@/app/components/BrandLoader";
import { Building2, Check, X, Clock, Mail, MapPin } from "lucide-react";

type Org = {
  id: string;
  name: string;
  relationship: string;
  status: string;
  contact_name: string | null;
  contact_email: string | null;
  location_count: number | null;
  notes: string | null;
  submitted_at: string | null;
  created_at: string;
};

const TABS = [["pending", "Pending"], ["active", "Approved"], ["rejected", "Rejected"]] as const;

export default function AdminPage() {
  const router = useRouter();
  const { profile, checking } = useAuth();
  const [tab, setTab] = useState<"pending" | "active" | "rejected">("pending");
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("organizations")
      .select("*")
      .eq("status", tab)
      .order("created_at", { ascending: false });
    setOrgs((data ?? []) as Org[]);
    setLoading(false);
  }, [tab]);

  useEffect(() => { if (profile?.is_platform_admin) load(); }, [profile, load]);

  const setStatus = async (org: Org, status: string) => {
    setBusy(org.id);
    const patch: Record<string, unknown> = { status };
    if (status === "active") {
      patch.approved_at = new Date().toISOString();
      patch.approved_by = profile?.id ?? null;
    }
    await supabase.from("organizations").update(patch).eq("id", org.id);
    setBusy(null);
    load();
  };

  if (checking) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading…" /></div>;

  if (!profile?.is_platform_admin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 gap-3 p-6 text-center">
        <p className="text-zinc-700 font-medium">This area is for platform admins only.</p>
        <button onClick={() => router.push("/dashboard")} className="text-sm text-blue-600 hover:underline">← Back to dashboard</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-2 mb-1">
          <Building2 size={20} className="text-zinc-500" />
          <h1 className="text-xl font-semibold text-zinc-900">Organizations</h1>
        </div>
        <p className="text-sm text-zinc-500 mb-5">Review and approve organizations requesting access to the platform.</p>

        <div className="flex gap-1 mb-5 border-b border-zinc-200">
          {TABS.map(([val, label]) => (
            <button
              key={val}
              onClick={() => setTab(val)}
              className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition ${tab === val ? "border-blue-600 text-blue-700" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <BrandLoader label="Loading…" />
        ) : orgs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-200 p-12 text-center text-zinc-400">No {tab} organizations.</div>
        ) : (
          <div className="space-y-3">
            {orgs.map((o) => (
              <div key={o.id} className="bg-white rounded-2xl border border-zinc-200 p-5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-zinc-900">{o.name}</h3>
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 capitalize">{o.relationship}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-600">
                    {o.contact_name && <span>{o.contact_name}</span>}
                    {o.contact_email && <span className="inline-flex items-center gap-1"><Mail size={13} />{o.contact_email}</span>}
                    {o.location_count != null && <span className="inline-flex items-center gap-1"><MapPin size={13} />{o.location_count} location{o.location_count === 1 ? "" : "s"}</span>}
                    <span className="inline-flex items-center gap-1 text-zinc-400"><Clock size={13} />{new Date(o.submitted_at || o.created_at).toLocaleDateString()}</span>
                  </div>
                  {o.notes && <p className="mt-2 text-sm text-zinc-500">{o.notes}</p>}
                </div>
                {tab === "pending" && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setStatus(o, "active")} disabled={busy === o.id} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-40"><Check size={14} />Approve</button>
                    <button onClick={() => setStatus(o, "rejected")} disabled={busy === o.id} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-100 text-zinc-600 hover:bg-red-50 hover:text-red-600 transition disabled:opacity-40"><X size={14} />Reject</button>
                  </div>
                )}
                {tab === "rejected" && (
                  <button onClick={() => setStatus(o, "active")} disabled={busy === o.id} className="text-xs font-medium text-emerald-600 hover:underline shrink-0">Approve anyway</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}