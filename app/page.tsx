"use client";

import { useRef, useState, useEffect } from "react";
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
  { href: "/dashboard/provider-database", icon: "🦷", title: "Provider Database", desc: "Browse dentists & hygienists, filter by location, and select providers for outreach.", accent: "#0080D0" },
  { href: "/dashboard/candidates", icon: "🎯", title: "Candidate Queue", desc: "Researched candidates — owners vs. associates, confidence, and social profiles.", accent: "#7c3aed" },
  { href: "/dashboard/my-data", icon: "📤", title: "My Data", desc: "Upload your own lists and send them to pipelines for enrichment.", accent: "#059669" },
  { href: "/dashboard/lookup", icon: "🔎", title: "Provider Lookup", desc: "Find any provider by NPI, name, or city, then send them to a pipeline.", accent: "#d97706" },
  { href: "/pipelines", icon: "🗂️", title: "Pipelines", desc: "Manage recruiting pipelines — enrichment, outreach status, and activity history.", accent: "#123B78" },
  { href: "/dashboard/jobs", icon: "💼", title: "Job Postings", desc: "Find dental job postings (hiring practices) on LinkedIn and more.", accent: "#0ea5e9" },
  { href: "/dashboard/pools", icon: "🤝", title: "Talent Pools", desc: "Match your talent to hiring practices and manage who to pitch where.", accent: "#0d9488" },
  { href: "/dashboard/reports", icon: "📋", title: "Reports & Tasks", desc: "Submit your weekly plan, get it approved as a checklist, and track your tasks.", accent: "#8b5cf6" },
];

const ROLE_LABEL: Record<string, string> = { admin: "Admin", manager: "Manager", member: "Member" };

export default function Dashboard() {
  const router = useRouter();
  const { profile, checking } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

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

  const displayName = profile?.full_name?.trim() || profile?.email?.split("@")[0] || "there";

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
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

          {/* Cards — two rows, horizontal slider when overflowing */}
          <div className="relative">
            {/* Left arrow */}
            {canLeft && (
              <button
                onClick={() => slide("left")}
                className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg border border-zinc-200 flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:shadow-xl transition"
                aria-label="Scroll left"
              >
                ‹
              </button>
            )}

            {/* Scrollable card area: 2-row grid that flows into columns and scrolls sideways */}
            <div
              ref={scrollRef}
              className="overflow-x-auto pb-2 scrollbar-hide"
              style={{ scrollbarWidth: "none" }}
            >
              <div
                className="grid grid-rows-2 grid-flow-col auto-cols-[minmax(260px,1fr)] gap-6"
                style={{ gridTemplateColumns: "unset" }}
              >
                {CARDS.map((c) => (
                  <Link
                    key={c.href}
                    href={c.href}
                    className="group relative overflow-hidden bg-white rounded-2xl p-6 shadow-sm border border-zinc-200 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg w-[300px] md:w-auto"
                  >
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

            {/* Right arrow */}
            {canRight && (
              <button
                onClick={() => slide("right")}
                className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg border border-zinc-200 flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:shadow-xl transition"
                aria-label="Scroll right"
              >
                ›
              </button>
            )}
          </div>
        </div>
      </main>

      <footer className="px-6 py-4 text-center text-xs text-zinc-400 border-t border-zinc-200">
        Dental Staffing Co-Pilot · Recruiting workspace
      </footer>
    </div>
  );
}