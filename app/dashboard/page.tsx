"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth, signOut } from "@/app/lib/useAuth";
import BrandLoader from "@/app/components/BrandLoader";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning ☀️";
  if (h < 18) return "Good afternoon 🌤️";
  return "Good evening 🌙";
}

const CARDS = [
  {
    href: "/dashboard/provider-database",
    icon: "🦷",
    title: "Provider Database",
    desc: "Browse dentists & hygienists, filter by location, and select providers for outreach.",
    accent: "#0080D0",
  },
  {
    href: "/dashboard/candidates",
    icon: "🎯",
    title: "Candidate Queue",
    desc: "Researched candidates — owners vs. associates, confidence, and social profiles.",
    accent: "#7c3aed",
  },
  {
    href: "/dashboard/my-data",
    icon: "📤",
    title: "My Data",
    desc: "Upload your own lists and send them to pipelines for enrichment.",
    accent: "#059669",
  },
  {
    href: "/dashboard/lookup",
    icon: "🔎",
    title: "Provider Lookup",
    desc: "Find any provider by NPI, name, or city, then send them to a pipeline.",
    accent: "#d97706",
  },
  {
    href: "/pipelines",
    icon: "🗂️",
    title: "Pipelines",
    desc: "Manage recruiting pipelines — enrichment, outreach status, and activity history.",
    accent: "#123B78",
  },
{
    href: "/dashboard/jobs",
    icon: "💼",
    title: "Job Postings",
    desc: "Find dental job postings (hiring practices) on LinkedIn and more.",
    accent: "#0ea5e9",
  },
{
    href: "/dashboard/pools",
    icon: "🤝",
    title: "Talent Pools",
    desc: "Match your talent to hiring practices and manage who to pitch where.",
    accent: "#0d9488",
  },
];

const ROLE_LABEL: Record<string, string> = { admin: "Admin", manager: "Manager", member: "Member" };

export default function Dashboard() {
  const router = useRouter();
  const { profile, checking } = useAuth();

  const handleLogout = async () => {
    await signOut();
    router.push("/");
  };

  if (checking) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading..." /></div>;

  const displayName = profile?.full_name?.trim() || profile?.email?.split("@")[0] || "there";

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      {/* Top bar */}
      <header className="flex justify-between items-center px-6 py-4 border-b border-zinc-200 bg-white">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/icon-color.png" alt="" className="w-10 h-10" />
          <h1 className="text-lg font-bold tracking-wide" style={{ color: "var(--brand-navy)" }}>
            DENTAL STAFFING <span className="font-medium" style={{ color: "var(--brand-blue)" }}>CO-PILOT</span>
          </h1>
        </div>
        <div className="flex items-center gap-4">
          {profile && profile.role !== "member" && (
            <Link href="/team" className="text-sm font-medium" style={{ color: "var(--brand-blue)" }}>Team</Link>
          )}
          <button onClick={handleLogout} className="text-sm text-zinc-500 hover:text-zinc-900 transition">Sign out</button>
        </div>
      </header>

      <main className="flex-1 px-6 py-10">
        <div className="max-w-6xl mx-auto">
          {/* Welcome header */}
          <div className="mb-10">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-3xl font-semibold" style={{ color: "var(--deep-navy)" }}>
                {greeting()}, {displayName}
              </h2>
              {profile?.role && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(18, 59, 120, 0.08)", color: "var(--brand-navy)" }}>
                  {ROLE_LABEL[profile.role] || profile.role}
                </span>
              )}
            </div>
            <p className="text-zinc-500 mt-2">Find providers, build pipelines, and run your outreach — all in one place.</p>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {CARDS.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="group relative overflow-hidden bg-white rounded-2xl p-6 shadow-sm border border-zinc-200 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
                style={{ ["--accent" as string]: c.accent }}
              >
                {/* accent strip */}
                <div className="absolute top-0 left-0 right-0 h-1 opacity-80" style={{ backgroundColor: c.accent }} />
                <div className="flex flex-col items-start space-y-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl transition-transform group-hover:scale-110" style={{ backgroundColor: c.accent + "1A" }}>
                    {c.icon}
                  </div>
                  <h3 className="text-lg font-semibold" style={{ color: "var(--brand-navy)" }}>{c.title}</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed">{c.desc}</p>
                  <span className="text-sm font-medium inline-flex items-center gap-1 group-hover:gap-2 transition-all" style={{ color: c.accent }}>
                    Open <span aria-hidden>→</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>

      <footer className="px-6 py-4 text-center text-xs text-zinc-400 border-t border-zinc-200">
        Dental Staffing Co-Pilot · Recruiting workspace
      </footer>
    </div>
  );
}