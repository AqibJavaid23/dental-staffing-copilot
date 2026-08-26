"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  // When arriving from the email link, Supabase establishes a recovery session
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // Also check if a session already exists (link already processed)
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => subscription.unsubscribe();
  }, []);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    if (password.length < 6) { setMsg("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setMsg("Passwords don't match."); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setMsg("Error: " + error.message);
    } else {
      setMsg("✓ Password updated! Redirecting to sign in...");
      setTimeout(() => router.push("/"), 1800);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4" style={{ background: "linear-gradient(160deg, #0B254B 0%, #123B78 100%)" }}>
      <form onSubmit={handleUpdate} className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 space-y-6">
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-color-transparent.png" alt="Dental Staffing Co-Pilot" className="mx-auto mb-2 w-56 h-auto" />
          <p className="text-sm text-zinc-500 mt-1">Set a new password</p>
        </div>

        {!ready ? (
          <p className="text-sm text-zinc-500 text-center">Verifying your reset link... If this doesn&apos;t proceed, request a new link from the sign-in page.</p>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">New password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-zinc-900 focus:outline-none focus:ring-2" style={{ ["--tw-ring-color" as string]: "var(--brand-blue)" }} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Confirm password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-zinc-900 focus:outline-none focus:ring-2" style={{ ["--tw-ring-color" as string]: "var(--brand-blue)" }} required />
            </div>

            {msg && <p className={`text-sm text-center ${msg.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>{msg}</p>}

            <button type="submit" disabled={loading} className="w-full py-2.5 text-white font-medium rounded-lg hover:opacity-90 transition disabled:opacity-60" style={{ backgroundColor: "var(--brand-blue)" }}>
              {loading ? "Updating..." : "Update password"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}