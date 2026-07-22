"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // The invite link contains a session token; detectSessionInUrl picks it up.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
      else setError("This invite link is invalid or has expired. Ask an admin to re-invite you.");
    });
  }, []);

  const handleSet = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setSaving(true);
    const { error: updErr } = await supabase.auth.updateUser({ password });
    if (updErr) { setError(updErr.message); setSaving(false); return; }
    router.push("/dashboard");
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4" style={{ background: "linear-gradient(160deg, #0B254B 0%, #123B78 100%)" }}>
      <form onSubmit={handleSet} className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 space-y-6">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-color-transparent.png" alt="Dental Staffing Co-Pilot" className="mx-auto mb-2 w-56 h-auto" />
          <p className="text-sm text-zinc-500 mt-1">Set your password to get started</p>
        </div>

        {ready ? (
          <>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">New password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-zinc-900 focus:outline-none focus:ring-2" style={{ ["--tw-ring-color" as string]: "var(--brand-blue)" }} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Confirm password</label>
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-zinc-900 focus:outline-none focus:ring-2" style={{ ["--tw-ring-color" as string]: "var(--brand-blue)" }} required />
              </div>
            </div>
            {error && <p className="text-sm text-red-500 text-center">{error}</p>}
            <button type="submit" disabled={saving} className="w-full py-2.5 text-white font-medium rounded-lg hover:opacity-90 transition disabled:opacity-60" style={{ backgroundColor: "var(--brand-blue)" }}>
              {saving ? "Saving..." : "Set password & continue"}
            </button>
          </>
        ) : (
          <p className="text-sm text-red-500 text-center">{error || "Loading..."}</p>
        )}
      </form>
    </div>
  );
}