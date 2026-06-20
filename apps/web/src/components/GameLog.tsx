import React, { useEffect, useRef } from "react";
import type { LogEntry } from "@18xx/shared";

type Props = {
  log: readonly LogEntry[];
};

const TYPE_COLOR: Record<string, string> = {
  action: "#e0e0e0",
  system: "#78c2f0",
  phase: "#f0a020",
};

export function GameLog({ log }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log.length]);

  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: 8,
        fontSize: 12,
        fontFamily: "monospace",
      }}
    >
      {log.map((entry, i) => (
        <div key={i} style={{ color: TYPE_COLOR[entry.type] ?? "#aaa", lineHeight: 1.4 }}>
          {entry.message}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
