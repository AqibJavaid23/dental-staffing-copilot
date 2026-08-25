"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth, signOut } from "@/app/lib/useAuth";
import NotificationBell from "@/app/components/NotificationBell";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/provider-database", label: "Providers" },
  { href: "/pipelines", label: "Pipelines" },
  { href: "/dashboard/jobs", label: "Jobs" },
  { href: "/dashboard/pools", label: "Pools" },
  { href: "/dashboard/reports", label: "Reports" },
  { href: "/dashboard/groups", label: "Groups" },
];

const HIDDEN_ON = ["/", "/set-password"];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, checking } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  if (HIDDEN_ON.includes(pathname) || checking || !profile) return null;

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(href + "/");
  };

  const handleLogout = async () => { await signOut(); router.push("/"); };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-zinc-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 shrink-0" onClick={() => setMenuOpen(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/icon-color.png" alt="" className="w-9 h-9" />
          <span className="text-sm font-bold tracking-wide hidden sm:inline" style={{ color: "var(--brand-navy)" }}>
            DENTAL <span className="font-medium" style={{ color: "var(--brand-blue)" }}>CO-PILOT</span>
          </span>
        </Link>

        {/* Desktop nav links (hidden on mobile) */}
        <nav className="hidden lg:flex items-center gap-1 flex-1 justify-center">
          {NAV_LINKS.map((l) => {
            const active = isActive(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className="px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition hover:bg-zinc-100"
                style={active ? { backgroundColor: "var(--brand-navy)", color: "white" } : { color: "#52525b" }}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <NotificationBell userId={profile.id} />
          {/* Desktop: Team + Sign out */}
          {profile.role !== "member" && (
            <Link href="/team" className="text-sm font-medium hidden lg:inline" style={{ color: "var(--brand-blue)" }}>Team</Link>
          )}
          <button onClick={handleLogout} className="text-sm text-zinc-500 hover:text-zinc-900 transition hidden lg:inline">Sign out</button>

          {/* Mobile: hamburger button (hidden on desktop) */}
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="lg:hidden flex flex-col items-center justify-center w-9 h-9 rounded-lg hover:bg-zinc-100 transition"
            aria-label="Menu"
          >
            <span className={`block w-5 h-0.5 bg-zinc-700 transition-all ${menuOpen ? "rotate-45 translate-y-1.5" : ""}`} />
            <span className={`block w-5 h-0.5 bg-zinc-700 my-1 transition-all ${menuOpen ? "opacity-0" : ""}`} />
            <span className={`block w-5 h-0.5 bg-zinc-700 transition-all ${menuOpen ? "-rotate-45 -translate-y-1.5" : ""}`} />
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="lg:hidden border-t border-zinc-200 bg-white">
          <nav className="px-4 py-3 flex flex-col gap-1">
            {NAV_LINKS.map((l) => {
              const active = isActive(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className="px-3 py-2.5 rounded-lg text-sm font-medium transition"
                  style={active ? { backgroundColor: "var(--brand-navy)", color: "white" } : { color: "#3f3f46" }}
                >
                  {l.label}
                </Link>
              );
            })}
            <div className="border-t border-zinc-100 mt-2 pt-2 flex flex-col gap-1">
              {profile.role !== "member" && (
                <Link href="/team" onClick={() => setMenuOpen(false)} className="px-3 py-2.5 rounded-lg text-sm font-medium" style={{ color: "var(--brand-blue)" }}>Team</Link>
              )}
              <button onClick={handleLogout} className="px-3 py-2.5 rounded-lg text-sm font-medium text-left text-zinc-600 hover:bg-zinc-50 transition">Sign out</button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}