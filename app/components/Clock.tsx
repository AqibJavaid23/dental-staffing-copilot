"use client";

import { useState, useEffect } from "react";

export default function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(id);
  }, []);

  if (!now) return null; // avoids server/client mismatch until mounted

  const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const tz = new Intl.DateTimeFormat([], { timeZoneName: "short" })
    .formatToParts(now)
    .find((p) => p.type === "timeZoneName")?.value || "";

  return (
    <div className="hidden sm:flex flex-col items-end leading-tight mr-1" title={Intl.DateTimeFormat().resolvedOptions().timeZone}>
      <span className="text-sm font-medium text-zinc-800 tabular-nums">{time}</span>
      <span className="text-[10px] text-zinc-400">{tz}</span>
    </div>
  );
}