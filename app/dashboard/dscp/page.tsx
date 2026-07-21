"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function DSCPPage() {
  const router = useRouter();

  useEffect(() => {
    if (localStorage.getItem("loggedIn") !== "true") router.push("/");
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-900">
      <header className="flex justify-between items-center px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition">
          ← Back
        </Link>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">DSCP</h1>
        <div className="w-12" />
      </header>

      <main className="flex-1 p-8">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">Scraped Jobs</h2>
          <p className="text-zinc-500 dark:text-zinc-400 mb-8">Latest scraped listings and updates will appear here.</p>

          <div className="bg-white dark:bg-zinc-800 rounded-2xl p-12 shadow-sm border border-zinc-200 dark:border-zinc-700 text-center">
            <p className="text-zinc-400 dark:text-zinc-500">Placeholder — ready for data</p>
          </div>
        </div>
      </main>
    </div>
  );
}