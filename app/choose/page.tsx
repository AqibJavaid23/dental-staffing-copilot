"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Target, HeartHandshake, ArrowRight } from "lucide-react";
import { useAuth } from "@/app/lib/useAuth";
import BrandLoader from "@/app/components/BrandLoader";

export default function ChoosePage() {
  const router = useRouter();
  const { profile, checking } = useAuth();
  const [leaving, setLeaving] = useState<string | null>(null);

  const go = (dest: string, key: string) => {
    setLeaving(key);
    setTimeout(() => router.push(dest), 450);
  };

  if (checking) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading..." /></div>;

  const displayName = profile?.full_name?.trim() || profile?.email?.split("@")[0] || "there";

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.15 } } };
  const item = { hidden: { opacity: 0, y: 26 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } } };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: "linear-gradient(160deg, #0B254B 0%, #123B78 100%)" }}>
      <motion.div
        initial={{ opacity: 0, y: -18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" as const }}
        className="text-center mb-10"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/icon-color.png" alt="" className="w-14 h-14 mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-white mb-1">Welcome back, {displayName}</h1>
        <p className="text-white/70">Where would you like to work today?</p>
      </motion.div>

      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
        {/* Recruitment */}
        <motion.div variants={item}>
          <button
            onClick={() => go("/dashboard", "rec")}
            className={`group relative w-full overflow-hidden rounded-3xl bg-white p-8 text-left shadow-2xl transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)] ${leaving === "rec" ? "scale-105 opacity-0" : leaving ? "opacity-30" : ""}`}
          >
            <div className="absolute top-0 left-0 right-0 h-1.5" style={{ backgroundColor: "#0080D0" }} />
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white mb-5 transition-transform group-hover:scale-110" style={{ background: "linear-gradient(135deg,#0080D0,#123B78)" }}>
              <Target size={30} strokeWidth={1.75} />
            </div>
            <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--brand-navy)" }}>Recruitment</h2>
            <p className="text-sm text-zinc-500 leading-relaxed mb-4">Providers, pipelines, enrichment, pools, job postings, and outreach.</p>
            <span className="text-sm font-semibold inline-flex items-center gap-1 group-hover:gap-2 transition-all" style={{ color: "#0080D0" }}>
              Enter <ArrowRight size={16} />
            </span>
          </button>
        </motion.div>

        {/* Client */}
        <motion.div variants={item}>
          <button
            onClick={() => go("/clients", "cli")}
            className={`group relative w-full overflow-hidden rounded-3xl bg-white p-8 text-left shadow-2xl transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)] ${leaving === "cli" ? "scale-105 opacity-0" : leaving ? "opacity-30" : ""}`}
          >
            <div className="absolute top-0 left-0 right-0 h-1.5" style={{ backgroundColor: "#0d9488" }} />
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white mb-5 transition-transform group-hover:scale-110" style={{ background: "linear-gradient(135deg,#0d9488,#0f766e)" }}>
              <HeartHandshake size={30} strokeWidth={1.75} />
            </div>
            <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--brand-navy)" }}>Client Coaching</h2>
            <p className="text-sm text-zinc-500 leading-relaxed mb-4">Client visibility, coaching calls, touch points, tasks, and staffing status.</p>
            <span className="text-sm font-semibold inline-flex items-center gap-1 group-hover:gap-2 transition-all" style={{ color: "#0d9488" }}>
              Enter <ArrowRight size={16} />
            </span>
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}