"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";

type Notif = {
  id: string;
  actor_name: string | null;
  message: string;
  link: string | null;
  read: boolean;
  created_at: string;
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function NotificationBell({ userId }: { userId: string }) {
  const router = useRouter();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    setNotifs((data ?? []) as Notif[]);
  }, [userId]);

  useEffect(() => {
    load();
    // Poll every 30s for new notifications
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [load]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unread = notifs.filter((n) => !n.read).length;

  const openPanel = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      // Mark all as read when opening
      await supabase.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
      setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    }
  };

  const clickNotif = (n: Notif) => {
    setOpen(false);
    if (n.link) router.push(n.link);
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={openPanel} className="relative text-zinc-500 hover:text-zinc-900 transition text-xl leading-none" aria-label="Notifications">
        🔔
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-[400px] overflow-y-auto bg-white rounded-xl shadow-2xl border border-zinc-200 z-50">
          <div className="px-4 py-3 border-b border-zinc-100">
            <h4 className="text-sm font-semibold text-zinc-900">Notifications</h4>
          </div>
          {notifs.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-zinc-400">No notifications yet.</div>
          ) : (
            <div>
              {notifs.map((n) => (
                <button
                  key={n.id}
                  onClick={() => clickNotif(n)}
                  className={`w-full text-left px-4 py-3 border-b border-zinc-50 hover:bg-zinc-50 transition ${!n.read ? "bg-blue-50/40" : ""}`}
                >
                  <p className="text-sm text-zinc-800">{n.message}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">{timeAgo(n.created_at)}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}