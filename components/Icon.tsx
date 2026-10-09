// Small stroke icon set for high-fidelity previews (24×24, currentColor).
import * as React from "react";
import { ICON_PATHS as PATHS } from "@/lib/icons";

export function Icon({ name, size = 20, strokeWidth = 1.8 }: { name: string; size?: number; strokeWidth?: number }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d={d} />
    </svg>
  );
}

/** Guess a tab icon from its label. */
export function tabIcon(label: string): string {
  const l = label.toLowerCase();
  if (/today|home/.test(l)) return "home";
  if (/history|log/.test(l)) return "history";
  if (/family|people|team|carer/.test(l)) return "people";
  if (/setting|account|profile/.test(l)) return "settings";
  if (/calendar|schedule|book/.test(l)) return "calendar";
  if (/search/.test(l)) return "search";
  if (/clinic|location|place|map/.test(l)) return "location";
  if (/exception|inbox|queue/.test(l)) return "inbox";
  if (/approv|review/.test(l)) return "check";
  if (/import|upload/.test(l)) return "upload";
  if (/match|reconcil/.test(l)) return "link";
  if (/audit|report|invoice|document|export/.test(l)) return "document";
  if (/dashboard|overview|insight/.test(l)) return "chart";
  return "more";
}
