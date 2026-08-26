"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/app/lib/useAuth";

type Msg = { role: "user" | "assistant"; text: string };

const HIDDEN_ON = ["/", "/set-password"];

export default function AiAssistant() {
  const pathname = usePathname();
  const { profile, checking } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", text: "Hi! I'm your Co-Pilot assistant. Ask me how to do something in the app, or paste a record you're stuck enriching and I'll help you figure out next steps." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, open]);

  if (HIDDEN_ON.includes(pathname) || checking || !profile) return null;

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setLoading(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "assistant", text: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setMessages((m) => [...m, { role: "assistant", text: data.result }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: "Sorry, I hit an error: " + (e instanceof Error ? e.message : "unknown") }]);
    } finally { setLoading(false); }
  };

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white text-2xl transition hover:scale-105"
          style={{ background: "linear-gradient(135deg, var(--brand-blue), var(--brand-navy))" }}
          aria-label="AI Assistant"
        >
          ✨
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[calc(100vw-3rem)] max-w-sm h-[500px] max-h-[70vh] bg-white rounded-2xl shadow-2xl border border-zinc-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 flex items-center justify-between text-white" style={{ background: "linear-gradient(135deg, var(--brand-blue), var(--brand-navy))" }}>
            <div className="flex items-center gap-2">
              <span className="text-lg">✨</span>
              <span className="font-semibold text-sm">Co-Pilot Assistant</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white text-lg leading-none">✕</button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto pretty-scroll p-3 space-y-3 bg-zinc-50">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-blue-600 text-white rounded-br-sm" : "bg-white border border-zinc-200 text-zinc-800 rounded-bl-sm"}`}
                  style={m.role === "user" ? { backgroundColor: "var(--brand-blue)" } : {}}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-zinc-200 text-zinc-400 px-3 py-2 rounded-2xl rounded-bl-sm text-sm">Thinking…</div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-zinc-200 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask me anything..."
              className="flex-1 px-3 py-2 border border-zinc-300 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={send} disabled={loading || !input.trim()} className="w-9 h-9 rounded-full text-white flex items-center justify-center transition disabled:opacity-40" style={{ background: "linear-gradient(135deg, var(--brand-blue), var(--brand-navy))" }} aria-label="Send">
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  );
}