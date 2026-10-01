"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/app/lib/useAuth";
import {
  LayoutDashboard, Stethoscope, Target, Search, Upload, GitBranch, Briefcase,
  Waypoints, Inbox, ListTodo, Layers, ClipboardList, Users, Megaphone,
  MessageSquare, Mail, Workflow, ArrowLeftRight, UserCog, LogOut, ShieldCheck,
  ChevronRight, ChevronDown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Prof = { id: string; role: string; is_platform_admin?: boolean };
type NavItem = { href: string; label: string; Icon: LucideIcon; exact?: boolean };

const DASHBOARD: NavItem = { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard, exact: true };

const GROUPS: { key: string; label: string; items: NavItem[] }[] = [
  {
    key: "recruiting",
    label: "Recruiting & Marketing",
    items: [
      { href: "/dashboard/provider-database", label: "Providers", Icon: Stethoscope },
      { href: "/dashboard/candidates", label: "Candidate Queue", Icon: Target },
      { href: "/dashboard/lookup", label: "Provider Lookup", Icon: Search },
      { href: "/dashboard/my-data", label: "My Data", Icon: Upload },
      { href: "/pipelines", label: "Enrichment Pipelines", Icon: GitBranch },
      { href: "/dashboard/jobs", label: "Jobs", Icon: Briefcase },
      { href: "/dashboard/pools", label: "Pools", Icon: Waypoints },
    ],
  },
  {
    key: "work",
    label: "Work System",
    items: [
      { href: "/requests", label: "Requests", Icon: Inbox },
      { href: "/work", label: "Work", Icon: ListTodo },
      { href: "/services", label: "Services", Icon: Layers },
    ],
  },
  {
    key: "team",
    label: "Team",
    items: [
      { href: "/dashboard/reports", label: "Reports", Icon: ClipboardList },
      { href: "/dashboard/groups", label: "Groups", Icon: Users },
    ],
  },
];

const PROSPECT: NavItem[] = [
  { href: "/dashboard/prospecting/sms", label: "SMS Campaign", Icon: MessageSquare },
  { href: "/dashboard/prospecting/email", label: "Email Campaign", Icon: Mail },
  { href: "/dashboard/prospecting/linkedin", label: "LinkedIn Flows", Icon: Workflow },
];

export default function Sidebar({
  profile, collapsed, mobile = false, onNavigate,
}: {
  profile: Prof; collapsed: boolean; onToggle?: () => void; mobile?: boolean; onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [prospectOpen, setProspectOpen] = useState(pathname.startsWith("/dashboard/prospecting"));
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ recruiting: true, work: true, team: true });

  const c = mobile ? false : collapsed;
  const width = c ? "w-16" : "w-60";
  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  const nav = () => { if (onNavigate) onNavigate(); };
  const logout = async () => { await signOut(); router.push("/"); };
  const toggleGroup = (key: string) => setOpenGroups((g) => ({ ...g, [key]: !g[key] }));

  const rowBase = "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition";

  const renderItem = (l: NavItem) => {
    const Icon = l.Icon;
    return (
      <Link
        key={l.href}
        href={l.href}
        onClick={nav}
        title={c ? l.label : undefined}
        className={`${rowBase} ${c ? "justify-center" : ""} hover:bg-zinc-100`}
        style={isActive(l.href, l.exact) ? { backgroundColor: "var(--brand-navy)", color: "white" } : { color: "#52525b" }}
      >
        <Icon size={18} strokeWidth={1.75} className="shrink-0" />
        {!c && <span className="truncate">{l.label}</span>}
      </Link>
    );
  };

  const prospectExpandable = (
    <>
      <button
        onClick={() => setProspectOpen((o) => !o)}
        className={`${rowBase} hover:bg-zinc-100`}
        style={pathname.startsWith("/dashboard/prospecting") ? { backgroundColor: "var(--brand-navy)", color: "white" } : { color: "#52525b" }}
      >
        <Megaphone size={18} strokeWidth={1.75} className="shrink-0" />
        <span className="truncate flex-1 text-left">Prospecting</span>
        {prospectOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
      </button>
      {prospectOpen && PROSPECT.map((p) => {
        const Icon = p.Icon;
        return (
          <Link
            key={p.href}
            href={p.href}
            onClick={nav}
            className="flex items-center gap-3 pl-9 pr-3 py-2 rounded-lg text-sm transition hover:bg-zinc-100"
            style={isActive(p.href) ? { color: "var(--brand-navy)", fontWeight: 600 } : { color: "#52525b" }}
          >
            <Icon size={16} strokeWidth={1.75} className="shrink-0" />
            <span className="truncate">{p.label}</span>
          </Link>
        );
      })}
    </>
  );

  const teamLink: NavItem = { href: "/team", label: "Team", Icon: UserCog };

  return (
    <aside className={`${width} shrink-0 h-screen sticky top-0 bg-white border-r border-zinc-200 flex flex-col transition-all duration-150`}>
      <div className="flex items-center gap-2 h-14 px-3 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/icon-color.png" alt="" className="w-9 h-9 shrink-0" />
        {!c && (
          <span className="text-sm font-bold tracking-wide truncate" style={{ color: "var(--brand-navy)" }}>
            DENTAL <span className="font-medium" style={{ color: "var(--brand-blue)" }}>CO-PILOT</span>
          </span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 flex flex-col gap-1">
        {renderItem(DASHBOARD)}

        {c ? (
          <>
            {GROUPS.flatMap((g) => g.items).map(renderItem)}
            <Link href="/dashboard/prospecting/sms" onClick={nav} title="Prospecting" className={`${rowBase} justify-center hover:bg-zinc-100`} style={pathname.startsWith("/dashboard/prospecting") ? { backgroundColor: "var(--brand-navy)", color: "white" } : { color: "#52525b" }}>
              <Megaphone size={18} strokeWidth={1.75} className="shrink-0" />
            </Link>
            {profile.role !== "member" && renderItem(teamLink)}
          </>
        ) : (
          GROUPS.map((g) => (
            <div key={g.key}>
              <button
                onClick={() => toggleGroup(g.key)}
                className="flex items-center gap-2 w-full px-3 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide transition hover:opacity-70"
                style={{ color: "var(--brand-navy)" }}
              >
                <span className="flex-1 text-left">{g.label}</span>
                <ChevronDown size={14} className={`transition-transform duration-200 ${openGroups[g.key] ? "" : "-rotate-90"}`} />
              </button>
              <div className="grid transition-[grid-template-rows] duration-200 ease-in-out" style={{ gridTemplateRows: openGroups[g.key] ? "1fr" : "0fr" }}>
                <div className="overflow-hidden flex flex-col gap-1">
                  {g.items.map(renderItem)}
                  {g.key === "recruiting" && prospectExpandable}
                  {g.key === "team" && profile.role !== "member" && renderItem(teamLink)}
                </div>
              </div>
            </div>
          ))
        )}
      </nav>

      <div className="px-2 py-3 border-t border-zinc-200 flex flex-col gap-1 shrink-0">
        <Link href="/choose" onClick={nav} title={c ? "Switch" : undefined} className={`${rowBase} ${c ? "justify-center" : ""} hover:bg-zinc-100`} style={{ color: "var(--brand-blue)" }}>
          <ArrowLeftRight size={18} strokeWidth={1.75} className="shrink-0" />{!c && <span>Switch</span>}
        </Link>
        {profile.is_platform_admin && (
          <Link href="/admin" onClick={nav} title={c ? "Admin" : undefined} className={`${rowBase} ${c ? "justify-center" : ""} hover:bg-zinc-100`} style={{ color: "#52525b" }}>
            <ShieldCheck size={18} strokeWidth={1.75} className="shrink-0" />{!c && <span>Admin</span>}
          </Link>
        )}
        <button onClick={logout} title={c ? "Sign out" : undefined} className={`${rowBase} ${c ? "justify-center" : ""} hover:bg-zinc-100 text-zinc-500`}>
          <LogOut size={18} strokeWidth={1.75} className="shrink-0" />{!c && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}