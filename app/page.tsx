"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 👇 Change these to whatever username/password you want
const USERNAME = "charles";
const PASSWORD = "1234";

export default function Home() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [splash, setSplash] = useState(false);
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === USERNAME && password === PASSWORD) {
      localStorage.setItem("loggedIn", "true");
      setSplash(true);
      router.prefetch("/dashboard");
      setTimeout(() => router.push("/dashboard"), 1500);
    } else {
      setError("Invalid username or password");
    }
  };

  return (
    <div
      className="flex min-h-screen w-full items-center justify-center p-4"
      style={{ background: "linear-gradient(160deg, #0B254B 0%, #123B78 100%)" }}
    >
      <form
        onSubmit={handleLogin}
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 space-y-6"
      >
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-color-transparent.png"
            alt="Dental Staffing Co-Pilot"
            className="mx-auto mb-2 w-56 h-auto"
          />
          <p className="text-sm text-zinc-500 mt-1">Provider outreach &amp; recruiting platform</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-zinc-900 focus:outline-none focus:ring-2"
              style={{ ["--tw-ring-color" as string]: "var(--brand-blue)" }}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-zinc-900 focus:outline-none focus:ring-2"
              style={{ ["--tw-ring-color" as string]: "var(--brand-blue)" }}
              required
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-500 text-center">{error}</p>}

        <button
          type="submit"
          className="w-full py-2.5 text-white font-medium rounded-lg hover:opacity-90 transition"
          style={{ backgroundColor: "var(--brand-blue)" }}
        >
          Sign in
        </button>
      </form>

      {splash && (
        <div className="splash-overlay">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-color-navy.png" alt="Dental Staffing Co-Pilot" />
          <div className="splash-progress" />
          <p className="splash-text">Preparing your workspace…</p>
        </div>
      )}
    </div>
  );
}