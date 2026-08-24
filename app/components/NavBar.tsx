"use client";

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

  if (HIDDEN_ON.includes(pathname) || checking || !profile) return null;

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(href + "/");
  };

  const handleLogout = async () => { await signOut(); router.push("/"); };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-zinc-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/icon-color.png" alt="" className="w-8 h-8" />
          <span className="text-sm font-bold tracking-wide hidden sm:inline" style={{ color: "var(--brand-navy)" }}>
            DENTAL <span className="font-medium" style={{ color: "var(--brand-blue)" }}>CO-PILOT</span>
          </span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1 overflow-x-auto scrollbar-hide flex-1 justify-center">
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

        {/* Right: bell, team, sign out */}
        <div className="flex items-center gap-3 shrink-0">
          <NotificationBell userId={profile.id} />
          {profile.role !== "member" && (
            <Link href="/team" className="text-sm font-medium hidden md:inline" style={{ color: "var(--brand-blue)" }}>Team</Link>
          )}
          <button onClick={handleLogout} className="text-sm text-zinc-500 hover:text-zinc-900 transition">Sign out</button>
        </div>
      </div>
    </header>
  );
}