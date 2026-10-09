"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useHotkeys } from "./useHotkeys";

const SHORTCUTS: [string, string][] = [
  ["?", "Show or hide this list"],
  ["g", "Go to all projects"],
  ["n", "New project (on the projects page)"],
  ["j / k", "Next / previous stage or project"],
  ["Enter", "Open the selected stage or project"],
  ["r", "Run the selected stage"],
  ["a", "Approve the latest version"],
  ["e", "Edit (on a stage page)"],
  ["h", "Version history (on a stage page)"],
  ["Esc", "Leave a text field or close this list"],
];

export function ShortcutHelp() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  useHotkeys({
    "?": () => setOpen((o) => !o),
    Escape: () => setOpen(false),
    g: () => router.push("/"),
  });
  if (!open) return null;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="kb-title" onClick={() => setOpen(false)}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <h2 id="kb-title">Keyboard shortcuts</h2>
        <div className="shortcuts">
          {SHORTCUTS.map(([k, d]) => (
            <div key={k} style={{ display: "contents" }}>
              <span><kbd>{k}</kbd></span>
              <span>{d}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
