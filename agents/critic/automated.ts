// Deterministic checks run on the UI spec before the Critic reviews it. Their results are
// handed to the Critic, which must include every one of them in its findings.
import { contrastReport } from "../design-system";
import type { DesignSystem } from "../design-system/schema";
import type { UI, UIBlockT } from "../ui/schema";
import type { FindingT } from "./schema";

const MIN_TARGET: Record<string, number> = { ios: 44, android: 48, web: 24 };
const flat = (blocks: UIBlockT[]) => blocks.flatMap((b) => [b, ...(b.children as UIBlockT[])]);

export function automatedFindings(ui: UI, ds: DesignSystem | undefined): FindingT[] {
  const out: Omit<FindingT, "id">[] = [];

  if (ds) {
    for (const r of contrastReport(ds).filter((x) => !x.passed)) {
      out.push({
        title: `Low contrast: ${r.label} (${r.platform}, ${r.mode})`, kind: "wcag", heuristic: "", wcag: r.min >= 4.5 ? "1.4.3 Contrast (Minimum)" : "1.4.11 Non-text Contrast",
        severity: 3, locations: [], evidence: `${r.ratio}:1 measured, ${r.min}:1 needed`, detail: "Text or controls may be unreadable for people with low vision.",
        recommendation: `Adjust the ${r.fg} or ${r.bg} colour in the design system.`, ownerStage: "design-system", source: "automated",
      });
    }
    for (const t of ds.themes.filter((t) => t.minTarget < (MIN_TARGET[t.platform] ?? 24))) {
      out.push({
        title: `Touch targets below the ${t.platform} minimum`, kind: "wcag", heuristic: "", wcag: "2.5.8 Target Size (Minimum)", severity: 3, locations: [],
        evidence: `minTarget ${t.minTarget}`, detail: "Small targets are hard to hit for people with limited dexterity.",
        recommendation: `Raise minTarget to ${MIN_TARGET[t.platform]}.`, ownerStage: "design-system", source: "automated",
      });
    }
  }

  const unnamed = new Map<string, { screenId: string; state: string }[]>();
  const silentLoading: { screenId: string; state: string }[] = [];
  const noRecovery: { screenId: string; state: string }[] = [];
  for (const s of ui.screens) {
    for (const st of s.states) {
      const blocks = flat(st.blocks);
      for (const b of blocks) {
        if (b.type === "button" && b.icon !== "none" && !b.copy && !b.text && !b.a11yLabel) {
          unnamed.set(s.screenId, [...(unnamed.get(s.screenId) ?? []), { screenId: s.screenId, state: st.state }]);
        }
        if ((b.type === "skeleton" || b.type === "spinner") && !b.copy && !/announce/i.test(b.note)) {
          silentLoading.push({ screenId: s.screenId, state: st.state });
        }
      }
      if (st.state === "error" && !blocks.some((b) => b.type === "button")) noRecovery.push({ screenId: s.screenId, state: st.state });
    }
  }
  for (const [, locs] of unnamed) {
    out.push({
      title: "Icon-only button without an accessible name", kind: "wcag", heuristic: "", wcag: "4.1.2 Name, Role, Value", severity: 3, locations: locs,
      evidence: "Button has an icon but no text and no a11yLabel", detail: "Screen reader users hear only 'button'.",
      recommendation: "Add an a11yLabel content key.", ownerStage: "ui", source: "automated",
    });
  }
  if (silentLoading.length) {
    out.push({
      title: "Loading state isn't announced to screen readers", kind: "wcag", heuristic: "", wcag: "4.1.3 Status Messages", severity: 2, locations: silentLoading,
      evidence: "Skeleton or spinner without an accessible status text", detail: "Screen reader users aren't told that content is loading.",
      recommendation: "Reference the screen's loading a11y string on the skeleton or spinner.", ownerStage: "ui", source: "automated",
    });
  }
  if (noRecovery.length) {
    out.push({
      title: "Error state with no way to recover", kind: "heuristic", heuristic: "H9 Help users recognize, diagnose, and recover from errors", wcag: "",
      severity: 3, locations: noRecovery, evidence: "No button in the error state", detail: "People are stuck when something fails.",
      recommendation: "Add a retry or alternative action.", ownerStage: "ui", source: "automated",
    });
  }
  return out.map((f, i) => ({ ...f, id: `A${i + 1}` }));
}
