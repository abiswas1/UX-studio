import type { AgentModule } from "../../lib/agents/types";
import { checklist, list, primaryForm, stageTask } from "../../lib/agents/helpers";
import { contrast } from "../../lib/a11y";
import { figmaFileKey } from "../../lib/figma/url";
import type { Wireframes } from "../wireframer/schema";
import { DesignSystemSchema, PALETTE_ROLES, type DesignSystem } from "./schema";

/** Text/background pairs that must reach WCAG 2.2 AA (4.5:1 text, 3:1 non-text). */
export const CONTRAST_PAIRS: { fg: string; bg: string; min: number; label: string }[] = [
  { fg: "text", bg: "background", min: 4.5, label: "Text on background" },
  { fg: "text", bg: "surface", min: 4.5, label: "Text on surface" },
  { fg: "textMuted", bg: "background", min: 4.5, label: "Muted text on background" },
  { fg: "textMuted", bg: "surface", min: 4.5, label: "Muted text on surface" },
  { fg: "onPrimary", bg: "primary", min: 4.5, label: "Button text on primary" },
  { fg: "onPrimaryContainer", bg: "primaryContainer", min: 4.5, label: "Text on primary container" },
  { fg: "primary", bg: "background", min: 4.5, label: "Primary (links, text buttons) on background" },
  { fg: "onDanger", bg: "danger", min: 4.5, label: "Text on danger" },
  { fg: "onDangerContainer", bg: "dangerContainer", min: 4.5, label: "Text on error banner" },
  { fg: "focus", bg: "background", min: 3, label: "Focus ring on background" },
];

export function contrastReport(ds: DesignSystem) {
  return ds.themes.flatMap((t) =>
    (["light", "dark"] as const).flatMap((mode) =>
      CONTRAST_PAIRS.map((p) => {
        const pal = t.color[mode] as Record<string, string>;
        const ratio = contrast(pal[p.fg], pal[p.bg]);
        return { platform: t.platform, mode, ...p, ratio, passed: ratio >= p.min };
      }),
    ),
  );
}

const MIN_TARGET: Record<string, number> = { ios: 44, android: 48, web: 24 };

export function designSystemDod(ds: DesignSystem, platforms: string[], wireframes: Wireframes | undefined) {
  const k = checklist();
  const missing = platforms.filter((p) => !ds.themes.some((t) => t.platform === p));
  k.add("themes", "There is a theme for every platform", missing.length === 0, `No theme for: ${missing.join(", ")}.`);

  const failing = contrastReport(ds).filter((r) => !r.passed);
  k.add("contrast", "Colour pairs meet WCAG 2.2 AA contrast in light and dark mode", failing.length === 0,
    failing.slice(0, 6).map((f) => `${f.platform}/${f.mode} ${f.label}: ${f.ratio}:1 (needs ${f.min}:1)`).join("; "));

  const smallTargets = ds.themes.filter((t) => t.minTarget < (MIN_TARGET[t.platform] ?? 24));
  k.add("targets", "Touch targets meet platform minimums (iOS 44pt, Android 48dp, web 24px)", smallTargets.length === 0,
    smallTargets.map((t) => `${t.platform}: ${t.minTarget}`).join(", "));

  const smallBody = ds.themes.filter((t) => t.type.body.size < (t.platform === "web" ? 14 : 16));
  k.add("body-size", "Body text is at least 16pt on mobile and 14px on web", smallBody.length === 0, smallBody.map((t) => `${t.platform}: ${t.type.body.size}`).join(", "));

  const tightLines = ds.themes.filter((t) => t.type.body.lineHeight < t.type.body.size * 1.25);
  k.add("line-height", "Body line height is at least 1.25× the text size", tightLines.length === 0, tightLines.map((t) => t.platform).join(", "));

  if (wireframes) {
    const used = new Set(wireframes.screens.flatMap((s) => s.states.flatMap((st) => st.blocks.flatMap((b) => [b.type, ...b.children.map((c) => c.type)]))));
    const unmapped: string[] = [];
    for (const t of ds.themes) {
      for (const block of used) {
        if (block === "row" || block === "divider") continue;
        if (!ds.components.some((c) => c.platform === t.platform && c.block === block)) unmapped.push(`${t.platform}:${block}`);
      }
    }
    k.add("mapping", "Every block used in the wireframes maps to a component on each platform", unmapped.length === 0,
      `Unmapped: ${unmapped.slice(0, 10).join(", ")}${unmapped.length > 10 ? "…" : ""}`);
  }

  if (ds.source.kind === "figma") {
    k.add("provenance", "Each theme says where its key values came from", ds.themes.every((t) => t.provenance.length > 0),
      "Add provenance entries for each theme.");
  }
  return k.result();
}

function toMarkdown(ds: DesignSystem): string {
  const out = ["# Design system", "", `Source: ${ds.source.kind}${ds.source.fileKey ? ` (Figma file ${ds.source.fileKey})` : ""}. ${ds.source.notes}`, "", "## Principles", "", list(ds.principles), ""];
  if (ds.libraries.length) out.push("## Libraries", "", ...ds.libraries.map((l) => `- **${l.name}** (${l.platforms.join(", ")}): ${l.usage}`), "");
  for (const t of ds.themes) {
    out.push(`## ${t.platform} theme — ${t.library}`, "", `Font: ${t.fontFamily}. Minimum target: ${t.minTarget}. Radius: ${t.radius.sm}/${t.radius.md}/${t.radius.lg}. Spacing: ${t.spacing.join(", ")}.`, "");
    out.push("| Role | Light | Dark |", "| --- | --- | --- |", ...PALETTE_ROLES.map((r) => `| ${r} | \`${t.color.light[r]}\` | \`${t.color.dark[r]}\` |`), "");
    out.push("| Type | Size / line | Weight |", "| --- | --- | --- |", ...Object.entries(t.type).map(([r, s]) => `| ${r} | ${s.size}/${s.lineHeight} | ${s.weight} |`), "");
    if (t.provenance.length) out.push("Sources:", "", list(t.provenance.map((p) => `${p.token} ← ${p.from}`)), "");
  }
  out.push("## Component mapping", "", "| Block | Variant | Platform | Component |", "| --- | --- | --- | --- |",
    ...ds.components.map((c) => `| ${c.block} | ${c.variant || "—"} | ${c.platform} | ${c.component} (${c.library}) |`), "");
  out.push("## Contrast", "", "| Platform | Mode | Pair | Ratio |", "| --- | --- | --- | --- |",
    ...contrastReport(ds).map((r) => `| ${r.platform} | ${r.mode} | ${r.label} | ${r.ratio}:1 ${r.passed ? "✓" : "✗"} |`), "");
  out.push("## Assumptions", "", list(ds.assumptions), "", "## Open questions", "", list(ds.openQuestions), "");
  return out.join("\n");
}

export const FIGMA_READ_TOOLS = ["search_design_system", "get_libraries", "get_variable_defs", "get_metadata", "use_figma"];

export const designSystemAgent: AgentModule<DesignSystem> = {
  id: "design-system",
  stage: "design-system",
  schema: DesignSystemSchema,
  tools: [],
  figmaTools: FIGMA_READ_TOOLS,
  buildTask: (ctx) => {
    const fileKey = figmaFileKey(ctx.project.figmaFileUrl ?? "");
    return stageTask(ctx, {
      inputs: [
        { stage: "wireframes", label: "Wireframes (blocks used)", pick: (w: Wireframes) => ({ blocksUsed: [...new Set(w.screens.flatMap((s) => s.states.flatMap((st) => st.blocks.map((b) => `${b.type}${b.variant !== "none" ? `/${b.variant}` : ""}`))))] }) },
      ],
      instructions: fileKey
        ? `The designer's Figma file key is ${fileKey}. Read the libraries attached to it with the Figma tools, pick the right library for each platform ` +
          `(${ctx.project.platforms.join(", ")}), read real token values where the library allows it, and map every wireframe block to a library component. ` +
          `Layout form: ${primaryForm(ctx.project.platforms)}.`
        : `No Figma file is connected. Create a minimal, accessible design system for ${ctx.project.platforms.join(", ")} that suits the product and its users, ` +
          "and map every wireframe block to a component (use 'Custom' as the component).",
    });
  },
  dod: (data, ctx) => designSystemDod(data, ctx.project.platforms, ctx.upstream.wireframes?.data as Wireframes | undefined),
  toMarkdown,
  extractState: (d) => ({ assumptions: d.assumptions, questions: d.openQuestions }),
};
