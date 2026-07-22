"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import BrandLoader from "@/app/components/BrandLoader";

type TeamUser = { id: string; email: string; full_name: string | null; role: string; created_at: string };

const ROLE_STYLE: Record<string, string> = {
  admin: "bg-blue-100 text-blue-700",
  manager: "bg-purple-100 text-purple-700",
  member: "bg-zinc-100 text-zinc-600",
};

export default function TeamPage() {
  const router = useRouter();
  const { profile, checking } = useAuth();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const authHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${data.session?.access_token}`, "Content-Type": "application/json" };
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/team", { headers: await authHeader() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setUsers(json.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally { setLoading(false); }
  }, [authHeader]);

  // Members can't be here
  useEffect(() => {
    if (!checking && profile && profile.role === "member") router.push("/dashboard");
  }, [checking, profile, router]);

  useEffect(() => { if (profile && profile.role !== "member") loadUsers(); }, [profile, loadUsers]);

  const invite = async () => {
    if (!inviteEmail.trim()) { setNotice("Enter an email"); return; }
    setInviting(true); setNotice(null);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: await authHeader(),
        body: JSON.stringify({ email: inviteEmail.trim(), full_name: inviteName.trim(), role: inviteRole }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Invite failed");
      setNotice(`Invite sent to ${inviteEmail}`);
      setInviteEmail(""); setInviteName(""); setInviteRole("member");
      loadUsers();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Invite failed");
    } finally { setInviting(false); }
  };

  const changeRole = async (userId: string, role: string) => {
    const res = await fetch("/api/team", { method: "PATCH", headers: await authHeader(), body: JSON.stringify({ userId, role }) });
    const json = await res.json();
    if (!res.ok) { alert(json.error || "Failed"); return; }
    loadUsers();
  };

  const removeUser = async (userId: string, email: string) => {
    if (!confirm(`Remove ${email}? They will lose access immediately.`)) return;
    const res = await fetch("/api/team", { method: "DELETE", headers: await authHeader(), body: JSON.stringify({ userId }) });
    const json = await res.json();
    if (!res.ok) { alert(json.error || "Failed"); return; }
    loadUsers();
  };

  if (checking || (profile && profile.role === "member")) {
    return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading..." /></div>;
  }

  const canMakeAdmin = profile?.role === "admin";

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="flex justify-between items-center px-6 py-4 border-b border-zinc-200 bg-white">
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900 transition">← Back</Link>
        <h1 className="text-lg font-semibold text-zinc-900">Team</h1>
        <div className="w-16" />
      </header>

      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Invite form */}
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5 space-y-3">
            <h2 className="font-semibold text-zinc-900">Invite a team member</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input type="email" placeholder="Email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="text" placeholder="Full name (optional)" value={inviteName} onChange={(e) => setInviteName(e.target.value)} className="px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="px-3 py-2 border border-zinc-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="member">Member</option>
                <option value="manager">Manager</option>
                {canMakeAdmin && <option value="admin">Admin</option>}
              </select>
              <button onClick={invite} disabled={inviting} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
                {inviting ? "Sending..." : "Send invite"}
              </button>
            </div>
            {notice && <p className="text-sm text-zinc-600">{notice}</p>}
          </div>

          {/* User list */}
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
            {error ? <div className="p-8 text-center text-red-500">{error}</div>
            : loading ? <BrandLoader label="Loading team..." />
            : (
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 border-b border-zinc-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-zinc-700">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-700">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-700">Role</th>
                    <th className="text-right px-4 py-3 font-medium text-zinc-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isSelf = u.id === profile?.id;
                    const targetIsAdmin = u.role === "admin";
                    const canEdit = !isSelf && (canMakeAdmin || !targetIsAdmin);
                    return (
                      <tr key={u.id} className="border-b border-zinc-100">
                        <td className="px-4 py-3 text-zinc-900">{u.full_name || "—"}{isSelf && <span className="text-xs text-zinc-400 ml-1">(you)</span>}</td>
                        <td className="px-4 py-3 text-zinc-600">{u.email}</td>
                        <td className="px-4 py-3">
                          {canEdit ? (
                            <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value)} className={`text-xs font-medium rounded px-2 py-1 border-0 ${ROLE_STYLE[u.role]}`}>
                              <option value="member">Member</option>
                              <option value="manager">Manager</option>
                              {canMakeAdmin && <option value="admin">Admin</option>}
                            </select>
                          ) : (
                            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded ${ROLE_STYLE[u.role]}`}>{u.role}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {canEdit && (
                            <button onClick={() => removeUser(u.id, u.email)} className="text-xs text-zinc-500 hover:text-red-500 transition">Remove</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}