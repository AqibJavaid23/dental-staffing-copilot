"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";

type Person = { id: string; name: string; total: number; done: number; overdue: number };
type Props = {
  groupId: string;
  adminIds: string[];
  managerIds: string[];
  memberIds: string[];
  nameOf: (id: string) => string;
  people: { id: string; full_name: string | null; email: string; role: string }[];
  existingIds: string[];        // everyone already in this group
  onChanged: () => void;        // refresh after adding
};

export default function DepartmentTree({ groupId, adminIds, managerIds, memberIds, nameOf, people, existingIds, onChanged }: Props) {
  const [admins, setAdmins] = useState<Person[]>([]);
  const [managers, setManagers] = useState<Person[]>([]);
  const [members, setMembers] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingRole, setAddingRole] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const statFor = async (uid: string): Promise<Person> => {
        const { data: reps } = await supabase.from("reports").select("id").eq("owner_id", uid).in("status", ["approved", "completed"]);
        const repIds = (reps ?? []).map((r) => r.id);
        if (repIds.length === 0) return { id: uid, name: nameOf(uid), total: 0, done: 0, overdue: 0 };
        const { data: items } = await supabase.from("report_items").select("done, deadline").in("report_id", repIds);
        const its = items ?? [];
        return { id: uid, name: nameOf(uid), total: its.length, done: its.filter((i) => i.done).length, overdue: its.filter((i) => !i.done && i.deadline && new Date(i.deadline) < today).length };
      };
      const [a, mg, mb] = await Promise.all([
        Promise.all(adminIds.map(statFor)),
        Promise.all(managerIds.map(statFor)),
        Promise.all(memberIds.map(statFor)),
      ]);
      setAdmins(a); setManagers(mg); setMembers(mb);
      setLoading(false);
    })();
  }, [groupId, adminIds.join(","), managerIds.join(","), memberIds.join(",")]);

  const addPerson = async (userId: string, role: string) => {
    if (!userId) return;
    const { error } = await supabase.from("group_members").insert({ group_id: groupId, user_id: userId, role_in_group: role });
    if (error) { alert(error.message.includes("duplicate") ? "Already in this group." : "Failed: " + error.message); return; }
    setAddingRole(null);
    onChanged();
  };

  if (loading) return <div className="py-6 text-center text-sm text-zinc-400">Loading tree...</div>;

  const ROLE_COLOR: Record<string, string> = { admin: "#7c3aed", manager: "var(--brand-navy)", member: "var(--brand-blue)" };

  const Node = ({ p, role }: { p: Person; role: string }) => {
    const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
    return (
      <div className="relative bg-white rounded-xl border shadow-sm px-4 py-3 w-52" style={{ borderWidth: role === "member" ? 1 : 2, borderColor: role !== "member" ? ROLE_COLOR[role] : (p.overdue > 0 ? "#fecaca" : "#e4e4e7") }}>        <div className="flex items-center gap-2 mb-1">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: ROLE_COLOR[role] }}>{p.name.charAt(0).toUpperCase()}</div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-zinc-900 truncate">{p.name}</div>
            <div className="text-[10px] text-zinc-400 uppercase tracking-wide">{role}</div>
          </div>
        </div>
        <div className="flex items-center justify-between text-[11px] mb-1">
          <span className="text-zinc-500">{p.done}/{p.total} done</span>
          {p.overdue > 0 && <span className="text-red-600 font-semibold">{p.overdue} overdue</span>}
        </div>
        <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
          <div className="h-full" style={{ width: `${pct}%`, backgroundColor: p.overdue > 0 ? "#dc2626" : "#059669" }} />
        </div>
      </div>
    );
  };

  const AddButton = ({ role, label }: { role: string; label: string }) => (
    <div className="flex flex-col items-center">
      {addingRole === role ? (
        <select
          autoFocus
          onChange={(e) => addPerson(e.target.value, role)}
          onBlur={() => setAddingRole(null)}
          defaultValue=""
          className="text-xs border border-zinc-300 rounded-lg px-2 py-1.5 bg-white"
        >
          <option value="" disabled>Choose a person...</option>
          {people.filter((p) => !existingIds.includes(p.id)).map((p) => (
            <option key={p.id} value={p.id}>{p.full_name || p.email} ({p.role})</option>
          ))}
        </select>
      ) : (
        <button onClick={() => setAddingRole(role)} className="px-3 py-1.5 text-xs font-medium border border-dashed border-zinc-300 text-zinc-500 rounded-lg hover:border-blue-400 hover:text-blue-600 transition">
          + {label}
        </button>
      )}
    </div>
  );

  return (
    <div className="py-4 overflow-x-auto">
      <div className="flex flex-col items-center min-w-fit gap-2">
        {/* Admin row */}
        <div className="flex gap-4 items-center justify-center flex-wrap">
          {admins.map((a) => <Node key={a.id} p={a} role="admin" />)}
          <AddButton role="admin" label="Admin above" />
        </div>

        {(admins.length > 0) && <div className="w-px h-5 bg-zinc-300" />}

        {/* Manager row */}
        <div className="flex gap-4 items-center justify-center flex-wrap">
          {managers.map((m) => <Node key={m.id} p={m} role="manager" />)}
        </div>

        <div className="w-px h-5 bg-zinc-300" />

        {/* Members row */}
        <div className="flex gap-4 items-start justify-center flex-wrap">
          {members.map((m) => (
            <div key={m.id} className="relative flex flex-col items-center">
              <Node p={m} role="member" />
            </div>
          ))}
          <AddButton role="member" label="Member below" />
        </div>
      </div>
    </div>
  );
}