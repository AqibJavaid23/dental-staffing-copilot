"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/lib/useAuth";
import { supabase } from "@/app/lib/supabase";
import BrandLoader from "@/app/components/BrandLoader";
import { Layers } from "lucide-react";

type Service = {
  id: string;
  code: string;
  name: string;
  department: string | null;
  description: string | null;
  status: string;
  sort_order: number;
};

export default function ServicesPage() {
  const { checking } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error: e } = await supabase
        .from("services")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (e) setError(e.message);
      setServices((data ?? []) as Service[]);
      setLoading(false);
    })();
  }, []);

  const groups: { department: string; items: Service[] }[] = [];
  for (const s of services) {
    const dept = s.department?.trim() || "Other";
    let g = groups.find((x) => x.department === dept);
    if (!g) { g = { department: dept, items: [] }; groups.push(g); }
    g.items.push(s);
  }

  if (checking) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading…" /></div>;

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-1">
          <Layers size={20} className="text-zinc-500" />
          <h1 className="text-xl font-semibold text-zinc-900">Service Catalog</h1>
        </div>
        <p className="text-sm text-zinc-500 mb-6">The services DSCP delivers. This list is the foundation every request, case, and task will connect to.</p>

        {loading ? (
          <BrandLoader label="Loading…" />
        ) : error ? (
          <div className="bg-white rounded-2xl border border-zinc-200 p-8 text-center text-red-500">{error}</div>
        ) : services.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-200 p-12 text-center text-zinc-400">
            No services yet. They&apos;re seeded via the database migration.
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map((g) => (
              <div key={g.department}>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">{g.department}</h2>
                <div className="space-y-3">
                  {g.items.map((s) => (
                    <div key={s.id} className={`bg-white rounded-2xl border border-zinc-200 p-5 ${s.status === "archived" || s.status === "draft" ? "opacity-60" : ""}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-zinc-900">{s.name}</h3>
                        {s.status === "archived" && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500">Archived</span>
                        )}
                        {s.status === "draft" && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Not live yet</span>
                        )}
                      </div>
                      {s.description && <p className="mt-1 text-sm text-zinc-500 leading-relaxed">{s.description}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}