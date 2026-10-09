// Small stroke icon set for high-fidelity previews (24×24, currentColor).
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
  return "more";
}
