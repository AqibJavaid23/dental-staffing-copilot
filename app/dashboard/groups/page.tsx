"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/lib/useAuth";
import BrandLoader from "@/app/components/BrandLoader";

type Profile = { id: string; full_name: string | null; email: string; role: string };
type GroupMember = { id: string; user_id: string; role_in_group: string };
type Group = { id: string; name: string; created_by: string | null; created_at: string; members: GroupMember[] };

export default function GroupsPage() {
  const { profile, checking } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [pickedMembers, setPickedMembers] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const nameOf = (uid: string) => {
    const p = people.find((x) => x.id === uid);
    return p ? (p.full_name || p.email) : "Unknown";
  };
  const roleOf = (uid: string) => people.find((x) => x.id === uid)?.role || "";

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email, role");
      setPeople((profs ?? []) as Profile[]);

      const { data: grps } = await supabase.from("groups").select("*").order("created_at", { ascending: false });
      const withMembers: Group[] = await Promise.all((grps ?? []).map(async (g) => {
        const { data: mems } = await supabase.from("group_members").select("*").eq("group_id", g.id);
        return { ...g, members: (mems ?? []) as GroupMember[] };
      }));
      setGroups(withMembers);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load groups");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const isManager = profile?.role === "manager" || profile?.role === "admin";
  const isAdmin = profile?.role === "admin";

  // Groups I manage
  const myManagedGroups = groups.filter((g) => g.members.some((m) => m.user_id === profile?.id && m.role_in_group === "manager"));
  // Groups I'm a member of
  const myMemberGroups = groups.filter((g) => g.members.some((m) => m.user_id === profile?.id && m.role_in_group === "member"));

  // Available members to add: everyone who is a 'member' role
  const availableMembers = people.filter((p) => p.role === "member");

  const createGroup = async () => {
    if (!newName.trim() || !profile) return;
    const chosen = Object.keys(pickedMembers).filter((k) => pickedMembers[k]);
    setCreating(true);
    try {
      const { data: g, error: e } = await supabase.from("groups").insert({ name: newName.trim(), created_by: profile.id }).select().single();
      if (e) throw e;
      // Creator becomes manager + add picked members
      const rows = [
        { group_id: g.id, user_id: profile.id, role_in_group: "manager" },
        ...chosen.map((uid) => ({ group_id: g.id, user_id: uid, role_in_group: "member" })),
      ];
      await supabase.from("group_members").insert(rows);
      setNewName(""); setPickedMembers({});
      load();
    } catch (e) {
      alert("Failed: " + (e instanceof Error ? e.message : "unknown"));
    } finally { setCreating(false); }
  };

  const deleteGroup = async (id: string, name: string) => {
    if (!confirm(`Delete group "${name}"?`)) return;
    await supabase.from("groups").delete().eq("id", id);
    load();
  };
  const addMember = async (groupId: string, userId: string) => {
    if (!userId) return;
    const { error: e } = await supabase.from("group_members").insert({ group_id: groupId, user_id: userId, role_in_group: "member" });
    if (e) { alert(e.message.includes("duplicate") ? "Already in this group." : "Failed: " + e.message); return; }
    load();
  };
  const removeMember = async (memberId: string) => { await supabase.from("group_members").delete().eq("id", memberId); load(); };

  if (checking || loading) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading..." /></div>;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="flex justify-between items-center px-6 py-4 border-b border-zinc-200 bg-white">
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-900 transition">← Back</Link>
        <h1 className="text-lg font-semibold text-zinc-900">Groups</h1>
        <div className="w-20" />
      </header>

      <main className="flex-1 p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {error && <div className="p-6 text-red-500 bg-red-50 rounded-lg">{error}</div>}

          {/* MANAGER: create a group */}
          {isManager && (
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
              <h3 className="font-semibold text-zinc-900 mb-3">Create a group</h3>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Group name (e.g. Enrichment Team)" className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3" />
              <div className="text-xs font-semibold text-zinc-500 uppercase mb-2">Select members</div>
              {availableMembers.length === 0 ? <p className="text-xs text-zinc-400 italic">No members available.</p> : (
                <div className="space-y-1 max-h-52 overflow-y-auto mb-3">
                  {availableMembers.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-50 cursor-pointer">
                      <input type="checkbox" checked={!!pickedMembers[p.id]} onChange={() => setPickedMembers((prev) => ({ ...prev, [p.id]: !prev[p.id] }))} className="h-4 w-4 rounded border-zinc-300 text-blue-600" />
                      <span className="text-sm text-zinc-800">{p.full_name || p.email}</span>
                    </label>
                  ))}
                </div>
              )}
              <button onClick={createGroup} disabled={creating || !newName.trim()} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
                {creating ? "Creating..." : "Create Group"}
              </button>
              <p className="text-xs text-zinc-400 mt-2">You&apos;ll be set as the manager of this group.</p>
            </div>
          )}

          {/* MANAGER: my groups */}
          {isManager && myManagedGroups.length > 0 && (
            <div>
              <h3 className="font-semibold text-zinc-900 mb-3">Groups I manage</h3>
              <div className="space-y-3">
                {myManagedGroups.map((g) => {
                  const members = g.members.filter((m) => m.role_in_group === "member");
                  const isOpen = openGroup === g.id;
                  return (
                    <div key={g.id} className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
                      <div className="flex items-center justify-between">
                        <button onClick={() => setOpenGroup(isOpen ? null : g.id)} className="flex items-center gap-2 text-left">
                          <span className="text-zinc-400">{isOpen ? "▾" : "▸"}</span>
                          <h4 className="font-semibold text-zinc-900">{g.name}</h4>
                          <span className="text-xs text-zinc-400">({members.length} members)</span>
                        </button>
                        <button onClick={() => deleteGroup(g.id, g.name)} className="text-zinc-400 hover:text-red-500 text-sm">✕</button>
                      </div>
                      {isOpen && (
                        <div className="mt-3 space-y-2">
                          {members.map((m) => (
                            <div key={m.id} className="flex items-center justify-between text-sm">
                              <span className="text-zinc-800">{nameOf(m.user_id)}</span>
                              <button onClick={() => removeMember(m.id)} className="text-xs text-zinc-400 hover:text-red-500">remove</button>
                            </div>
                          ))}
                          <select onChange={(e) => { addMember(g.id, e.target.value); e.target.value = ""; }} defaultValue="" className="text-xs border border-zinc-300 rounded-lg px-2 py-1.5 bg-white mt-1">
                            <option value="" disabled>+ Add member...</option>
                            {availableMembers.filter((p) => !g.members.some((m) => m.user_id === p.id)).map((p) => (
                              <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* MEMBER: my group(s) + manager(s) */}
          {myMemberGroups.length > 0 && (
            <div>
              <h3 className="font-semibold text-zinc-900 mb-3">My Team</h3>
              <div className="space-y-3">
                {myMemberGroups.map((g) => {
                  const managers = g.members.filter((m) => m.role_in_group === "manager");
                  const teammates = g.members.filter((m) => m.role_in_group === "member" && m.user_id !== profile?.id);
                  return (
                    <div key={g.id} className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
                      <h4 className="font-semibold text-zinc-900 mb-2">{g.name}</h4>
                      <div className="text-xs text-zinc-500 mb-1">Manager{managers.length > 1 ? "s" : ""}: <span className="text-zinc-800">{managers.map((m) => nameOf(m.user_id)).join(", ") || "—"}</span></div>
                      <div className="text-xs text-zinc-500">Teammates: <span className="text-zinc-800">{teammates.map((m) => nameOf(m.user_id)).join(", ") || "just you"}</span></div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ADMIN: the tree */}
          {isAdmin && (
            <div>
              <h3 className="font-semibold text-zinc-900 mb-3">All Groups (Admin)</h3>
              {groups.length === 0 ? <p className="text-sm text-zinc-400">No groups yet.</p> : (
                <div className="space-y-3">
                  {groups.map((g) => {
                    const managers = g.members.filter((m) => m.role_in_group === "manager");
                    const members = g.members.filter((m) => m.role_in_group === "member");
                    return (
                      <div key={g.id} className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold text-zinc-900">{g.name}</h4>
                          <button onClick={() => deleteGroup(g.id, g.name)} className="text-zinc-400 hover:text-red-500 text-sm">✕</button>
                        </div>
                        <div className="text-xs text-zinc-500 mb-1">Managers: <span className="text-zinc-800">{managers.map((m) => nameOf(m.user_id)).join(", ") || "—"}</span></div>
                        <div className="text-xs text-zinc-500">Members: <span className="text-zinc-800">{members.map((m) => `${nameOf(m.user_id)}`).join(", ") || "—"}</span></div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}