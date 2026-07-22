"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth, signOut } from "@/app/lib/useAuth";
import BrandLoader from "@/app/components/BrandLoader";

export default function Dashboard() {
  const router = useRouter();
  const { profile, checking } = useAuth();

  const handleLogout = async () => {
    await signOut();
    router.push("/");
  };

  if (checking) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading..." /></div>;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="flex justify-between items-center px-6 py-4 border-b border-zinc-200 bg-white">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/icon-color.png" alt="" className="w-12 h-12" />
          <h1 className="text-lg font-bold tracking-wide" style={{ color: "var(--brand-navy)" }}>
            DENTAL STAFFING{" "}
            <span className="font-medium" style={{ color: "var(--brand-blue)" }}>CO-PILOT</span>
          </h1>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-zinc-500 hover:text-zinc-900 transition"
        >
          Sign out
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-semibold" style={{ color: "var(--deep-navy)" }}>Recruiting workspace</h2>
            <p className="text-zinc-500 mt-2">Find providers, build pipelines, run outreach.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Link href="/dashboard/provider-database" className="group card-hover bg-white rounded-2xl p-8 shadow-sm border border-zinc-200">
              <div className="flex flex-col items-start space-y-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: "rgba(0, 128, 208, 0.1)" }}>🦷</div>
                <h3 className="text-xl font-semibold" style={{ color: "var(--brand-navy)" }}>Provider Database</h3>
                <p className="text-sm text-zinc-500">Browse dentists &amp; hygienists, filter by location, and select providers for outreach.</p>
                <span className="text-sm font-medium group-hover:translate-x-1 transition inline-block" style={{ color: "var(--brand-blue)" }}>Open →</span>
              </div>
            </Link>
            <Link href="/dashboard/candidates" className="group card-hover bg-white rounded-2xl p-8 shadow-sm border border-zinc-200">
              <div className="flex flex-col items-start space-y-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: "rgba(0, 128, 208, 0.1)" }}>🎯</div>
                <h3 className="text-xl font-semibold" style={{ color: "var(--brand-navy)" }}>Candidate Queue</h3>
                <p className="text-sm text-zinc-500">Researched candidates — owners vs. associates, confidence, and social profiles.</p>
                <span className="text-sm font-medium group-hover:translate-x-1 transition inline-block" style={{ color: "var(--brand-blue)" }}>Open →</span>
              </div>
            </Link>
            <Link href="/pipelines" className="group card-hover bg-white rounded-2xl p-8 shadow-sm border border-zinc-200">
              <div className="flex flex-col items-start space-y-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: "rgba(18, 59, 120, 0.08)" }}>🗂️</div>
                <h3 className="text-xl font-semibold" style={{ color: "var(--brand-navy)" }}>Pipelines</h3>
                <p className="text-sm text-zinc-500">Manage recruiting pipelines — enrichment, statuses, and outreach progress.</p>
                <span className="text-sm font-medium group-hover:translate-x-1 transition inline-block" style={{ color: "var(--brand-blue)" }}>Open →</span>
              </div>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}