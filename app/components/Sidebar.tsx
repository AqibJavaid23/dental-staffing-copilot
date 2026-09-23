"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/app/lib/useAuth";

type Prof = { id: string; role: string };

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠", exact: true },
  { href: "/dashboard/provider-database", label: "Providers", icon: "🦷" },
  { href: "/dashboard/candidates", label: "Candidate Queue", icon: "🎯" },
  { href: "/dashboard/my-data", label: "My Data", icon: "📤" },
  { href: "/dashboard/lookup", label: "Provider Lookup", icon: "🔎" },
  { href: "/pipelines", label: "Enrichment Pipelines", icon: "🗂️" },
  { href: "/dashboard/jobs", label: "Jobs", icon: "💼" },
  { href: "/dashboard/pools", label: "Pools", icon: "🤝" },
  { href: "/dashboard/reports", label: "Reports", icon: "📋" },
  { href: "/dashboard/groups", label: "Groups", icon: "👥" },
];
const PROSPECT = [
  { href: "/dashboard/prospecting/sms", label: "SMS Campaign", icon: "💬" },
  { href: "/dashboard/prospecting/email", label: "Email Campaign", icon: "✉️" },
  { href: "/dashboard/prospecting/linkedin", label: "LinkedIn Flows", icon: "🔗" },
];

export default function Sidebar({
  profile, collapsed, mobile = false, onNavigate,
}: {
  profile: Prof; collapsed: boolean; onToggle?: () => void; mobile?: boolean; onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [prospectOpen, setProspectOpen] = useState(pathname.startsWith("/dashboard/prospecting"));

  const c = mobile ? false : collapsed;
  const width = c ? "w-16" : "w-60";
  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  const nav = () => { if (onNavigate) onNavigate(); };
  const logout = async () => { await signOut(); router.push("/"); };

  const rowBase = "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition";

  return (
    <aside className={`${width} shrink-0 h-screen sticky top-0 bg-white border-r border-zinc-200 flex flex-col transition-all duration-150`}>
      <div className="flex items-center gap-2 h-14 px-3 border-b border-zinc-200 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/icon-color.png" alt="" className="w-9 h-9 shrink-0" />
        {!c && (
          <span className="text-sm font-bold tracking-wide truncate" style={{ color: "var(--brand-navy)" }}>
            DENTAL <span className="font-medium" style={{ color: "var(--brand-blue)" }}>CO-PILOT</span>
          </span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 flex flex-col gap-1">
        {NAV.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            onClick={nav}
            title={c ? l.label : undefined}
            className={`${rowBase} ${c ? "justify-center" : ""} hover:bg-zinc-100`}
            style={isActive(l.href, l.exact) ? { backgroundColor: "var(--brand-navy)", color: "white" } : { color: "#52525b" }}
          >
            <span className="text-lg leading-none">{l.icon}</span>
            {!c && <span className="truncate">{l.label}</span>}
          </Link>
        ))}

        <button
          onClick={() => setProspectOpen((o) => !o)}
          title={c ? "Prospecting" : undefined}
          className={`${rowBase} ${c ? "justify-center" : ""} hover:bg-zinc-100`}
          style={pathname.startsWith("/dashboard/prospecting") ? { backgroundColor: "var(--brand-navy)", color: "white" } : { color: "#52525b" }}
        >
          <span className="text-lg leading-none">📣</span>
          {!c && <><span className="truncate flex-1 text-left">Prospecting</span><span className="text-xs">{prospectOpen ? "▾" : "▸"}</span></>}
        </button>
        {!c && prospectOpen && PROSPECT.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            onClick={nav}
            className="flex items-center gap-3 pl-9 pr-3 py-2 rounded-lg text-sm transition hover:bg-zinc-100"
            style={isActive(p.href) ? { color: "var(--brand-navy)", fontWeight: 600 } : { color: "#52525b" }}
          >
            <span className="text-base leading-none">{p.icon}</span>
            <span className="truncate">{p.label}</span>
          </Link>
        ))}
      </nav>

      <div className="px-2 py-3 border-t border-zinc-200 flex flex-col gap-1 shrink-0">
        <Link href="/choose" onClick={nav} title={c ? "Switch" : undefined} className={`${rowBase} ${c ? "justify-center" : ""} hover:bg-zinc-100`} style={{ color: "var(--brand-blue)" }}>
          <span className="text-lg leading-none">⇄</span>{!c && <span>Switch</span>}
        </Link>
        {profile.role !== "member" && (
          <Link href="/team" onClick={nav} title={c ? "Team" : undefined} className={`${rowBase} ${c ? "justify-center" : ""} hover:bg-zinc-100`} style={{ color: "#52525b" }}>
            <span className="text-lg leading-none">👤</span>{!c && <span>Team</span>}
          </Link>
        )}
        <button onClick={logout} title={c ? "Sign out" : undefined} className={`${rowBase} ${c ? "justify-center" : ""} hover:bg-zinc-100 text-zinc-500`}>
          <span className="text-lg leading-none">↩</span>{!c && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}