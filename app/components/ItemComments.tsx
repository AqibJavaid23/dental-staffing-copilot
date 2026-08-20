"use client";

import { useState } from "react";
import { supabase } from "@/app/lib/supabase";

type Comment = {
  id: string;
  author_name: string | null;
  body: string;
  created_at: string;
};

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function ItemComments({
  itemId,
  reportId,
  authorId,
  authorName,
}: {
  itemId: string;
  reportId: string;
  authorId: string;
  authorName: string;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  // Load the count once (lightweight) on first render
  const loadCount = async () => {
    const { count: c } = await supabase.from("item_comments").select("*", { count: "exact", head: true }).eq("item_id", itemId);
    setCount(c ?? 0);
  };
  // lazy: fetch count on mount
  if (count === null) { loadCount(); }

  const loadComments = async () => {
    const { data } = await supabase.from("item_comments").select("*").eq("item_id", itemId).order("created_at", { ascending: true });
    setComments((data ?? []) as Comment[]);
    setCount((data ?? []).length);
    setLoaded(true);
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded) loadComments();
  };

  const post = async () => {
    if (!text.trim()) return;
    setPosting(true);
    try {
      const { error } = await supabase.from("item_comments").insert({
        item_id: itemId, report_id: reportId, author_id: authorId, author_name: authorName, body: text.trim(),
      });
      if (error) throw error;
      // Also log to report activity
      await supabase.from("report_activity").insert({
        report_id: reportId, actor_id: authorId, actor_name: authorName,
        action: "comment", detail: `commented on a task`,
      });
      setText("");
      await loadComments();
    } catch (e) {
      alert("Failed to comment: " + (e instanceof Error ? e.message : "unknown"));
    } finally { setPosting(false); }
  };

  return (
    <div className="mt-1">
      <button onClick={toggle} className="text-[11px] text-zinc-400 hover:text-blue-600 transition">
        💬 {count ?? 0} {open ? "▾" : "▸"}
      </button>

      {open && (
        <div className="mt-2 pl-2 border-l-2 border-zinc-100 space-y-2">
          {loaded && comments.length === 0 && <p className="text-[11px] text-zinc-400 italic">No comments yet.</p>}
          {comments.map((c) => (
            <div key={c.id} className="text-xs">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-zinc-700">{c.author_name || "Unknown"}</span>
                <span className="text-zinc-400 text-[10px]">{fmt(c.created_at)}</span>
              </div>
              <p className="text-zinc-600">{c.body}</p>
            </div>
          ))}
          <div className="flex gap-1">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && post()}
              placeholder="Add a comment..."
              className="flex-1 px-2 py-1 border border-zinc-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button onClick={post} disabled={posting || !text.trim()} className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition disabled:opacity-40">
              {posting ? "..." : "Post"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}