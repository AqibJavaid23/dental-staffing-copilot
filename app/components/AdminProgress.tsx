"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";

type Profile = { id: string; full_name: string | null; email: string; role: string };
type MemberStat = {
  userId: string;
  name: string;
  total: number;
  done: number;
  overdue: number;
};
type ManagerBlock = {
  managerId: string;
  managerName: string;
  groups: string[];        // group names this manager runs
  members: MemberStat[];
};

export default function AdminProgress() {
  const [blocks, setBlocks] = useState<ManagerBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // All people
        const { data: profs } = await supabase.from("profiles").select("id, full_name, email, role");
        const people = (profs ?? []) as Profile[];
        const nameOf = (uid: string) => {
          const p = people.find((x) => x.id === uid);
          return p ? (p.full_name || p.email) : "Unknown";
        };

        // All groups + members
        const { data: groups } = await supabase.from("groups").select("id, name");
        const { data: gm } = await supabase.from("group_members").select("group_id, user_id, role_in_group");
        const gmRows = gm ?? [];
        const groupName: Record<string, string> = {};
        (groups ?? []).forEach((g) => { groupName[g.id] = g.name; });

        // Build manager → { groups, memberIds }
        const managerMap: Record<string, { groups: Set<string>; memberIds: Set<string> }> = {};
        // For each group, find its managers and members
        (groups ?? []).forEach((g) => {
          const inThis = gmRows.filter((r) => r.group_id === g.id);
          const mgrs = inThis.filter((r) => r.role_in_group === "manager").map((r) => r.user_id);
          const mems = inThis.filter((r) => r.role_in_group === "member").map((r) => r.user_id);
          mgrs.forEach((mid) => {
            if (!managerMap[mid]) managerMap[mid] = { groups: new Set(), memberIds: new Set() };
            managerMap[mid].groups.add(g.name);
            mems.forEach((uid) => managerMap[mid].memberIds.add(uid));
          });
        });

        // Compute per-member stats (from approved/completed reports' items)
        const today = new Date(); today.setHours(0, 0, 0, 0);

        const statFor = async (uid: string): Promise<MemberStat> => {
          const { data: reps } = await supabase.from("reports").select("id").eq("owner_id", uid).in("status", ["approved", "completed"]);
          const repIds = (reps ?? []).map((r) => r.id);
          if (repIds.length === 0) return { userId: uid, name: nameOf(uid), total: 0, done: 0, overdue: 0 };
          const { data: items } = await supabase.from("report_items").select("done, deadline").in("report_id", repIds);
          const its = items ?? [];
          const total = its.length;
          const done = its.filter((i) => i.done).length;
          const overdue = its.filter((i) => !i.done && i.deadline && new Date(i.deadline) < today).length;
          return { userId: uid, name: nameOf(uid), total, done, overdue };
        };

        const result: ManagerBlock[] = [];
        for (const [mid, info] of Object.entries(managerMap)) {
          const memberStats = await Promise.all([...info.memberIds].map((uid) => statFor(uid)));
          result.push({
            managerId: mid,
            managerName: nameOf(mid),
            groups: [...info.groups],
            members: memberStats,
          });
        }
        // Sort managers by name
        result.sort((a, b) => a.managerName.localeCompare(b.managerName));
        setBlocks(result);
      } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="py-8 text-center text-zinc-400 text-sm">Loading team progress...</div>;
  if (blocks.length === 0) return <p className="text-sm text-zinc-400">No managers with groups yet.</p>;

  return (
    <div className="space-y-3">
      {blocks.map((b) => {
        const isOpen = open === b.managerId;
        // Manager-level totals
        const total = b.members.reduce((s, m) => s + m.total, 0);
        const done = b.members.reduce((s, m) => s + m.done, 0);
        const overdue = b.members.reduce((s, m) => s + m.overdue, 0);
        const pct = total ? Math.round((done / total) * 100) : 0;
        return (
          <div key={b.managerId} className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
            <button onClick={() => setOpen(isOpen ? null : b.managerId)} className="w-full text-left">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-zinc-400">{isOpen ? "▾" : "▸"}</span>
                  <div className="min-w-0">
                    <div className="font-semibold text-zinc-900 truncate">{b.managerName} <span className="text-xs font-normal text-zinc-400">· manager</span></div>
                    <div className="text-xs text-zinc-500 truncate">{b.groups.join(", ") || "no groups"} · {b.members.length} members</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-medium text-zinc-900">{done}/{total}</div>
                  {overdue > 0 && <div className="text-[11px] text-red-600">{overdue} overdue</div>}
                </div>
              </div>
              <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden mt-3">
                <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
              </div>
            </button>

            {isOpen && (
              <div className="mt-4 pt-4 border-t border-zinc-100 space-y-3">
                {b.members.length === 0 ? <p className="text-xs text-zinc-400 italic">No members in this manager&apos;s groups.</p>
                : b.members.map((m) => {
                  const mpct = m.total ? Math.round((m.done / m.total) * 100) : 0;
                  return (
                    <div key={m.userId}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-zinc-800">{m.name}</span>
                        <span className="text-zinc-500 text-xs">{m.done}/{m.total}{m.overdue > 0 && <span className="text-red-600"> · {m.overdue} overdue</span>}</span>
                      </div>
                      <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                        <div className="h-full" style={{ width: `${mpct}%`, backgroundColor: m.overdue > 0 ? "#dc2626" : "#059669" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}