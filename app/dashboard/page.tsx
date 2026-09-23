"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth, signOut } from "@/app/lib/useAuth";
import BrandLoader from "@/app/components/BrandLoader";
import MyWeek from "@/app/components/MyWeek";
import NotificationBell from "@/app/components/NotificationBell";
import TaskPanel from "@/app/components/TaskPanel";
import AssignedTasks from "@/app/components/AssignedTasks";

const CARDS = [
  { href: "/dashboard/provider-database", icon: "🦷", title: "Provider Database", desc: "Browse dentists & hygienists, filter by location, and select providers for outreach.", accent: "#0080D0" },
  { href: "/dashboard/candidates", icon: "🎯", title: "Candidate Queue", desc: "Researched candidates — owners vs. associates, confidence, and social profiles.", accent: "#7c3aed" },
  { href: "/dashboard/my-data", icon: "📤", title: "My Data", desc: "Upload your own lists and send them to pipelines for enrichment.", accent: "#059669" },
  { href: "/dashboard/lookup", icon: "🔎", title: "Provider Lookup", desc: "Find any provider by NPI, name, or city, then send them to a pipeline.", accent: "#d97706" },
  { href: "/pipelines", icon: "🗂️", title: "Pipelines", desc: "Manage recruiting pipelines — enrichment, outreach status, and activity history.", accent: "#123B78" },
  { href: "/dashboard/jobs", icon: "💼", title: "Job Postings", desc: "Find dental job postings (hiring practices) on LinkedIn and more.", accent: "#0ea5e9" },
  { href: "/dashboard/pools", icon: "🤝", title: "Talent Pools", desc: "Match your talent to hiring practices and manage who to pitch where.", accent: "#0d9488" },
  { href: "/dashboard/reports", icon: "📋", title: "Reports & Tasks", desc: "Submit your weekly plan, get it approved as a checklist, and track your tasks.", accent: "#8b5cf6" },
  { href: "/dashboard/groups", icon: "👥", title: "Groups", desc: "Create and manage your teams (departments) and see who reports to whom.", accent: "#6366f1" },
];

export default function Dashboard() {
  const router = useRouter();
  const { profile, checking } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const [prospectPopup, setProspectPopup] = useState(false);

  const updateArrows = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useEffect(() => {
    updateArrows();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows);
    window.addEventListener("resize", updateArrows);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, [checking]);

  const slide = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -el.clientWidth : el.clientWidth, behavior: "smooth" });
  };

  const handleLogout = async () => { await signOut(); router.push("/"); };

  if (checking) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading..." /></div>;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <main className="flex-1 px-6 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Two-column workspace: tasks left, cards right */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LEFT — task panel */}
            <div>
              {profile && <TaskPanel profile={profile} />}
            </div>

            {/* RIGHT — My Week stats + card slider */}
            <div className="min-w-0">
              {profile && <MyWeek userId={profile.id} />}
              {profile && <AssignedTasks userId={profile.id} />}

              <div className="relative">
                {canLeft && (
                  <button onClick={() => slide("left")} className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg border border-zinc-200 flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:shadow-xl transition" aria-label="Scroll left">‹</button>
                )}

                <div ref={scrollRef} className="overflow-x-auto pb-2 scrollbar-hide" style={{ scrollbarWidth: "none" }}>
                  <div className="grid grid-rows-2 grid-flow-col auto-cols-[minmax(240px,1fr)] gap-4">
                                  <button onClick={() => setProspectPopup(true)} className="group relative overflow-hidden bg-white rounded-2xl p-5 shadow-sm border border-zinc-200 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg w-[260px] text-left">
                  <div className="absolute top-0 left-0 right-0 h-1 opacity-80" style={{ backgroundColor: "#e11d48" }} />
                  <div className="flex flex-col items-start space-y-2">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl transition-transform group-hover:scale-110" style={{ backgroundColor: "#e11d481A" }}>📣</div>
                    <h3 className="text-base font-semibold" style={{ color: "var(--brand-navy)" }}>Prospecting</h3>
                    <p className="text-xs text-zinc-500 leading-relaxed">Run SMS or email campaigns for prospecting.</p>
                    <span className="text-xs font-medium inline-flex items-center gap-1 group-hover:gap-2 transition-all" style={{ color: "#e11d48" }}>Start <span aria-hidden>→</span></span>
                  </div>
                </button>
                    {CARDS.map((c) => (
                      <Link key={c.href} href={c.href} className="group relative overflow-hidden bg-white rounded-2xl p-5 shadow-sm border border-zinc-200 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg w-[260px]">
                        <div className="absolute top-0 left-0 right-0 h-1 opacity-80" style={{ backgroundColor: c.accent }} />
                        <div className="flex flex-col items-start space-y-2">
                          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl transition-transform group-hover:scale-110" style={{ backgroundColor: c.accent + "1A" }}>{c.icon}</div>
                          <h3 className="text-base font-semibold" style={{ color: "var(--brand-navy)" }}>{c.title}</h3>
                          <p className="text-xs text-zinc-500 leading-relaxed">{c.desc}</p>
                          <span className="text-xs font-medium inline-flex items-center gap-1 group-hover:gap-2 transition-all" style={{ color: c.accent }}>Open <span aria-hidden>→</span></span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>

                {canRight && (
                  <button onClick={() => slide("right")} className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg border border-zinc-200 flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:shadow-xl transition" aria-label="Scroll right">›</button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
      {prospectPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setProspectPopup(false)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-zinc-900">Start a Campaign</h3>
              <button onClick={() => setProspectPopup(false)} className="text-zinc-400 hover:text-zinc-900">✕</button>
            </div>
            <div className="space-y-3">
              <Link href="/dashboard/prospecting/sms" className="flex items-center gap-3 p-4 rounded-xl border border-zinc-200 hover:border-blue-400 hover:bg-blue-50/40 transition">
                <span className="text-2xl">💬</span>
                <div>
                  <div className="font-semibold text-zinc-900">SMS Campaign</div>
                  <div className="text-xs text-zinc-500">Text your prospects via SMS</div>
                </div>
              </Link>
              <Link href="/dashboard/prospecting/email" className="flex items-center gap-3 p-4 rounded-xl border border-zinc-200 hover:border-blue-400 hover:bg-blue-50/40 transition">
                <span className="text-2xl">✉️</span>
                <div>
                  <div className="font-semibold text-zinc-900">Email Campaign</div>
                  <div className="text-xs text-zinc-500">Email your prospects from your domain</div>
                </div>
              </Link>
                            <Link href="/dashboard/prospecting/linkedin" className="flex items-center gap-3 p-4 rounded-xl border border-zinc-200 hover:border-blue-400 hover:bg-blue-50/40 transition">
                <span className="text-2xl">🔗</span>
                <div>
                  <div className="font-semibold text-zinc-900">LinkedIn Flows</div>
                  <div className="text-xs text-zinc-500">Design LinkedIn outreach on a canvas</div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}
      <footer className="px-6 py-4 text-center text-xs text-zinc-400 border-t border-zinc-200">
        Dental Staffing Co-Pilot · Recruiting workspace
      </footer>
    </div>
  );
}