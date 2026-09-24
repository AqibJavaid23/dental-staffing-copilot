"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/app/lib/supabase";

export default function Home() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [splash, setSplash] = useState(false);
  const router = useRouter();

  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError || !data.session) {
      setError(authError?.message || "Invalid email or password");
      setLoading(false);
      return;
    }
    setSplash(true);
    router.prefetch("/choose");
    setTimeout(() => router.push("/choose"), 3000);
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetMsg("");
    if (!resetEmail.trim()) { setResetMsg("Enter your email."); return; }
    setResetLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetLoading(false);
    if (resetError) setResetMsg("Error: " + resetError.message);
    else setResetMsg("✓ If that email exists, a reset link has been sent. Check your inbox.");
  };

  const cardMotion = {
    initial: { opacity: 0, y: 24, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -20, scale: 0.98 },
    transition: { duration: 0.4, ease: "easeOut" as const },
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4" style={{ background: "linear-gradient(160deg, #0B254B 0%, #123B78 100%)" }}>
      <AnimatePresence mode="wait">
        {!forgotMode ? (
          <motion.form key="login" onSubmit={handleLogin} {...cardMotion} className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 space-y-6">
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <motion.img
                src="/brand/logo-color-transparent.png"
                alt="Dental Staffing Co-Pilot"
                className="mx-auto mb-2 w-56 h-auto"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" as const }}
              />
              <p className="text-sm text-zinc-500 mt-1">Provider outreach &amp; recruiting platform</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-zinc-900 focus:outline-none focus:ring-2" style={{ ["--tw-ring-color" as string]: "var(--brand-blue)" }} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-zinc-900 focus:outline-none focus:ring-2" style={{ ["--tw-ring-color" as string]: "var(--brand-blue)" }} required />
              </div>
            </div>

            {error && <p className="text-sm text-red-500 text-center">{error}</p>}

            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" disabled={loading} className="w-full py-2.5 text-white font-medium rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed" style={{ backgroundColor: "var(--brand-blue)" }}>
              {loading ? "Signing in..." : "Sign in"}
            </motion.button>

            <button type="button" onClick={() => { setForgotMode(true); setResetMsg(""); setResetEmail(email); }} className="w-full text-center text-sm text-zinc-500 hover:text-zinc-800 transition">
              Forgot password?
            </button>
          </motion.form>
        ) : (
          <motion.form key="forgot" onSubmit={handleReset} {...cardMotion} className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 space-y-6">
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/logo-color-transparent.png" alt="Dental Staffing Co-Pilot" className="mx-auto mb-2 w-56 h-auto" />
              <p className="text-sm text-zinc-500 mt-1">Reset your password</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Email</label>
              <input type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="you@example.com" className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-zinc-900 focus:outline-none focus:ring-2" style={{ ["--tw-ring-color" as string]: "var(--brand-blue)" }} required />
              <p className="text-xs text-zinc-400 mt-1">We&apos;ll email you a link to reset your password.</p>
            </div>

            {resetMsg && <p className={`text-sm text-center ${resetMsg.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>{resetMsg}</p>}

            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" disabled={resetLoading} className="w-full py-2.5 text-white font-medium rounded-lg transition disabled:opacity-60" style={{ backgroundColor: "var(--brand-blue)" }}>
              {resetLoading ? "Sending..." : "Send reset link"}
            </motion.button>

            <button type="button" onClick={() => { setForgotMode(false); setResetMsg(""); }} className="w-full text-center text-sm text-zinc-500 hover:text-zinc-800 transition">
              ← Back to sign in
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {splash && (
        <div className="splash-overlay">
          <div className="splash-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="splash-logo-color" src="/brand/logo-color-transparent.png" alt="Dental Staffing Co-Pilot" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="splash-logo-white" src="/brand/logo-white.png" alt="" aria-hidden="true" />
          </div>
          <div className="splash-progress" />
          <p className="splash-text">Preparing your workspace…</p>
        </div>
      )}
    </div>
  );
}