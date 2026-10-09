import type { AgentModule, AgentContext } from "../../lib/agents/types";
import { checklist, list, stageTask } from "../../lib/agents/helpers";
import type { UI } from "../ui/schema";
import type { DesignSystem } from "../design-system/schema";
import type { Content } from "../content/schema";
import type { Architecture } from "../architect/schema";
import { CritiqueSchema, HEURISTICS, REQUIRED_WCAG, type Critique } from "./schema";
import { automatedFindings } from "./automated";

function automatedFor(ctx: AgentContext) {
  const ui = ctx.upstream.ui?.data as UI | undefined;
  return ui ? automatedFindings(ui, ctx.upstream["design-system"]?.data as DesignSystem | undefined) : [];
}

export function critiqueDod(c: Critique, ctx: { ui?: UI; automatedIds: string[] }) {
  const k = checklist();
  const reviewed = new Set(c.heuristicsReviewed.map((h) => h.heuristic));
  const missingH = HEURISTICS.filter((h) => !reviewed.has(h));
  k.add("heuristics", "All 10 Nielsen heuristics are reviewed", missingH.length === 0, `Missing: ${missingH.join(", ")}.`);

  const checked = c.wcagChecked.map((w) => w.criterion);
  const missingW = REQUIRED_WCAG.filter((n) => !checked.some((x) => x.startsWith(n + " ") || x === n));
  k.add("wcag", "Key WCAG 2.2 AA criteria are checked", missingW.length === 0, `Not checked: ${missingW.join(", ")}.`);

  const ids = new Set(c.findings.map((f) => f.id));
  const dropped = ctx.automatedIds.filter((id) => !ids.has(id));
  k.add("automated", "Every automated check result is included", dropped.length === 0, `Missing: ${dropped.join(", ")}.`);

  const vague = c.findings.filter((f) => !f.recommendation.trim() || !f.evidence.trim());
  k.add("actionable", "Every finding has evidence and a recommendation", vague.length === 0, vague.map((f) => f.id).join(", "));

  const unlocated = c.findings.filter((f) => f.severity >= 3 && f.source === "review" && f.locations.length === 0);
  k.add("located", "Serious findings say which screens they affect", unlocated.length === 0, unlocated.map((f) => f.id).join(", "));

  if (ctx.ui) {
    const real = new Set(ctx.ui.screens.flatMap((s) => s.states.map((st) => `${s.screenId}/${st.state}`)));
    const screensOnly = new Set(ctx.ui.screens.map((s) => s.screenId));
    const bad = c.findings.flatMap((f) => f.locations.filter((l) => !real.has(`${l.screenId}/${l.state}`) && !(l.state === "*" && screensOnly.has(l.screenId))).map((l) => `${f.id}: ${l.screenId}/${l.state}`));
    k.add("locations", "Finding locations match real screens and states", bad.length === 0, bad.slice(0, 6).join(", "));
  }
  const typed = c.findings.filter((f) => (f.kind === "heuristic" && !f.heuristic) || (f.kind === "wcag" && !f.wcag));
  k.add("classified", "Each finding names its heuristic or WCAG criterion", typed.length === 0, typed.map((f) => f.id).join(", "));
  return k.result();
}

export const seriousFindings = (c: Critique) => c.findings.filter((f) => f.severity >= 3);

function toMarkdown(c: Critique): string {
  const bySeverity = [...c.findings].sort((a, b) => b.severity - a.severity);
  const out = ["# Critique", "", c.summary, "", "## Strengths", "", list(c.strengths), "", "## Findings", ""];
  out.push("| ID | Severity | Finding | Rule | Where | Fix owner |", "| --- | --- | --- | --- | --- | --- |");
  for (const f of bySeverity) {
    out.push(`| ${f.id} | ${f.severity} | ${f.title} | ${f.heuristic || f.wcag} | ${f.locations.map((l) => `${l.screenId}/${l.state}`).join(", ") || "—"} | ${f.ownerStage} |`);
  }
  out.push("");
  for (const f of bySeverity) out.push(`### ${f.id}. ${f.title} (severity ${f.severity})`, "", f.detail, "", `Evidence: ${f.evidence}`, "", `Recommendation: ${f.recommendation}`, "");
  out.push("## Heuristics", "", ...c.heuristicsReviewed.map((h) => `- **${h.heuristic}**: ${h.verdict}. ${h.note}`), "");
  out.push("## WCAG 2.2 AA", "", ...c.wcagChecked.map((w) => `- **${w.criterion}**: ${w.result}. ${w.note}`), "");
  return out.join("\n");
}

export const critic: AgentModule<Critique> = {
  id: "critic",
  stage: "critique",
  schema: CritiqueSchema,
  tools: [],
  buildTask: (ctx) => {
    const auto = automatedFor(ctx);
    return stageTask(ctx, {
      inputs: [
        { stage: "architecture", label: "Architecture (screens and sitemap)", pick: (a: Architecture) => ({ screens: a.screens, sitemap: a.sitemap }) },
        { stage: "content", label: "Content deck", pick: (c: Content) => ({ voice: c.voice, screens: c.screens, errors: c.errors }) },
        { stage: "design-system", label: "Design system", pick: (d: DesignSystem) => ({ themes: d.themes.map((t) => ({ platform: t.platform, color: t.color, type: t.type, minTarget: t.minTarget })) }) },
        { stage: "ui", label: "UI" },
      ],
      instructions:
        "Review the UI against Nielsen's 10 heuristics and WCAG 2.2 AA. These automated checks already ran; include every one of them in your findings with the same id:\n" +
        "```json\n" + JSON.stringify(auto, null, 1) + "\n```\n" +
        "Then add your own findings (ids C1, C2, …), rate each 1–4, and name the stage that owns the fix.",
    });
  },
  dod: (data, ctx) => critiqueDod(data, { ui: ctx.upstream.ui?.data as UI | undefined, automatedIds: automatedFor(ctx).map((f) => f.id) }),
  toMarkdown,
  extractState: (d) => ({
    assumptions: [],
    questions: seriousFindings(d).map((f) => `Open severity ${f.severity} issue (${f.id}): ${f.title}`),
  }),
};
