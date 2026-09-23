"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/app/lib/useAuth";
import Sidebar from "@/app/components/Sidebar";
import NotificationBell from "@/app/components/NotificationBell";

const HIDDEN_ON = ["/", "/set-password", "/reset-password", "/choose"];

const SECTIONS: [string, string, boolean?][] = [
  ["/dashboard", "Dashboard", true],
  ["/dashboard/provider-database", "Providers"],
  ["/dashboard/candidates", "Candidate Queue"],
  ["/dashboard/my-data", "My Data"],
  ["/dashboard/lookup", "Provider Lookup"],
  ["/dashboard/jobs", "Jobs"],
  ["/dashboard/pools", "Pools"],
  ["/dashboard/reports", "Reports"],
  ["/dashboard/groups", "Groups"],
  ["/dashboard/prospecting", "Prospecting"],
  ["/pipelines", "Enrichment Pipelines"],
  ["/team", "Team"],
  ["/clients", "Clients"],
];
function titleFor(path: string): string {
  let best = ""; let bestLen = -1;
  for (const [prefix, label, exact] of SECTIONS) {
    const match = exact ? path === prefix : path === prefix || path.startsWith(prefix + "/");
    if (match && prefix.length > bestLen) { best = label; bestLen = prefix.length; }
  }
  return best;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning ☀️";
  if (h < 18) return "Good afternoon 🌤️";
  return "Good evening 🌙";
}
const ROLE_LABEL: Record<string, string> = { admin: "Admin", manager: "Manager", member: "Member" };

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile, checking } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem("sidebarCollapsed") === "1"); } catch { /* ignore */ }
  }, []);
  const toggleCollapsed = () =>
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("sidebarCollapsed", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const showShell = !HIDDEN_ON.includes(pathname) && !checking && !!profile;
  if (!showShell || !profile) return <>{children}</>;

  const title = titleFor(pathname);

  return (
    <div className="relative flex min-h-screen">
      <div className="hidden lg:block">
        <Sidebar profile={profile} collapsed={collapsed} onToggle={toggleCollapsed} />
      </div>

      <button
        onClick={toggleCollapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="hidden lg:flex fixed z-40 items-center justify-center w-6 h-6 rounded-full bg-white border border-zinc-300 shadow text-zinc-500 hover:text-zinc-900 hover:shadow-md transition-all text-xs"
        style={{ left: (collapsed ? 64 : 240) - 12, top: 74 }}
      >
        {collapsed ? "»" : "«"}
      </button>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10">
            <Sidebar profile={profile} collapsed={false} mobile onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="sticky top-0 z-30 flex items-center gap-3 h-14 px-4 bg-white/95 backdrop-blur border-b border-zinc-200">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden flex items-center justify-center w-9 h-9 rounded-lg hover:bg-zinc-100 transition text-xl text-zinc-700"
            aria-label="Open menu"
          >
            ☰
          </button>
          {pathname === "/dashboard" ? (
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-base font-semibold text-zinc-900 truncate">{greeting()}, {profile.full_name?.trim() || profile.email?.split("@")[0] || "there"}</h1>
              {profile.role && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: "rgba(18, 59, 120, 0.08)", color: "var(--brand-navy)" }}>{ROLE_LABEL[profile.role] || profile.role}</span>
              )}
            </div>
          ) : title ? (
            <h1 className="text-base font-semibold text-zinc-900 truncate">{title}</h1>
          ) : null}
          <div className="flex-1" />
          <NotificationBell userId={profile.id} />
        </div>

        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}