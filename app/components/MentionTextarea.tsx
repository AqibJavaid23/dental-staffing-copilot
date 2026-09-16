"use client";

import { useRef, useState, useEffect } from "react";

type Person = { id: string; full_name: string | null; email: string };

const handleOf = (p: Person) =>
  ((p.full_name && p.full_name.trim()) ? p.full_name.trim().split(/\s+/)[0] : p.email.split("@")[0]).toLowerCase();

const NAV_KEYS = new Set(["ArrowUp", "ArrowDown", "Enter", "Tab", "Escape"]);

export default function MentionTextarea({
  value, onChange, people, placeholder, rows = 3, className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  people: Person[];
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [caretPos, setCaretPos] = useState(0);
  const [pendingCaret, setPendingCaret] = useState<number | null>(null);
  const [active, setActive] = useState(0);

  // Reset the highlighted row whenever the search text changes
  useEffect(() => { setActive(0); }, [query]);

  // After we insert a mention, put the caret back in the right spot
  useEffect(() => {
    if (pendingCaret !== null && ref.current) {
      ref.current.focus();
      ref.current.setSelectionRange(pendingCaret, pendingCaret);
      setPendingCaret(null);
    }
  }, [pendingCaret, value]);

  const detect = (el: HTMLTextAreaElement) => {
    const caret = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, caret);
    const m = /(^|\s)@([A-Za-z0-9._-]*)$/.exec(before);
    if (m) {
      setQuery(m[2].toLowerCase());
      setCaretPos(caret);
    } else {
      setQuery(null);
    }
  };

  const matches = query === null ? [] : people
    .filter((p) => {
      const h = handleOf(p);
      const name = (p.full_name || "").toLowerCase();
      return h.startsWith(query) || name.includes(query);
    })
    .slice(0, 6);

  const pick = (p: Person) => {
    const h = handleOf(p);
    const before = value.slice(0, caretPos);
    const m = /(^|\s)@([A-Za-z0-9._-]*)$/.exec(before);
    if (!m) return;
    const atIndex = caretPos - m[2].length - 1; // position of the '@'
    const next = value.slice(0, atIndex) + "@" + h + " " + value.slice(caretPos);
    onChange(next);
    setQuery(null);
    setPendingCaret(atIndex + h.length + 2);
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => { onChange(e.target.value); detect(e.target); }}
        onClick={(e) => detect(e.currentTarget)}
        onKeyDown={(e) => {
          if (query === null || matches.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(matches[active]); }
          else if (e.key === "Escape") { setQuery(null); }
        }}
        onKeyUp={(e) => { if (query !== null && NAV_KEYS.has(e.key)) return; detect(e.currentTarget); }}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        rows={rows}
        placeholder={placeholder}
        className={className}
      />
      {query !== null && matches.length > 0 && (
        <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-zinc-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
          {matches.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(p); }}
              className={`w-full text-left px-3 py-2 text-sm transition ${i === active ? "bg-teal-50" : "hover:bg-zinc-50"}`}
            >
              <span className="font-medium text-zinc-800">{p.full_name || p.email}</span>
              <span className="text-zinc-400 text-xs ml-1.5">@{handleOf(p)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}