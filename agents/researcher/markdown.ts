import type { Research } from "./schema";

const list = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join("\n") : "_None._");
const tag = (basis: string) => (basis === "evidence" ? "Evidence" : "Assumption");

export function researchToMarkdown(r: Research): string {
  const out: string[] = ["# Research", "", "## Problem", "", r.problem.statement, "", r.problem.context, ""];
  out.push("**Who is affected**", "", list(r.problem.whoIsAffected), "");
  out.push("**What people do today**", "", list(r.problem.currentAlternatives), "");
  out.push("**Constraints**", "", list(r.problem.constraints), "");
  out.push("**Signs of success**", "", list(r.problem.successSignals), "");

  out.push("## Competitors and alternatives", "");
  for (const c of r.competitors) {
    out.push(`### [${c.name}](${c.url}) · ${c.category}`, "", c.summary, "");
    out.push("**Strengths**", "", list(c.strengths), "", "**Weaknesses**", "", list(c.weaknesses), "");
    if (c.notablePatterns.length) out.push("**Patterns to note**", "", list(c.notablePatterns), "");
    out.push("Sources: " + c.sources.map((s) => `[${s.title}](${s.url}) (read ${s.accessed})`).join(", "), "");
  }

  out.push("## Personas", "");
  for (const p of r.personas) {
    out.push(`### ${p.name} · ${tag(p.basis)}`, "", p.context, "", `_Based on: ${p.basisNote}_`, "");
    out.push("**Goals**", "", list(p.goals), "", "**Frustrations**", "", list(p.frustrations), "");
    if (p.behaviours.length) out.push("**Behaviours**", "", list(p.behaviours), "");
  }

  out.push("## Jobs to be done", "");
  for (const j of r.jobs) out.push(`- When ${j.situation}, I want to ${j.motivation}, so I can ${j.outcome}. _(${tag(j.basis)})_`);
  out.push("");

  out.push("## Insights", "");
  for (const i of r.insights) {
    out.push(`- **${i.id}. ${i.insight}** _(${tag(i.basis)})_  `, `  Implication: ${i.implication}`);
    if (i.supportedBy.length) out.push(`  Supported by: ${i.supportedBy.join(", ")}`);
  }
  out.push("");

  out.push("## How might we", "");
  for (const h of r.hmw) out.push(`- ${h.question} _(from ${h.linkedInsights.join(", ")})_`);
  out.push("");

  if (r.uploadsSynthesis.length) {
    out.push("## Uploaded research", "");
    for (const u of r.uploadsSynthesis) out.push(`### ${u.file}`, "", list(u.keyFindings), "");
  }

  out.push("## Assumptions", "", list(r.assumptions), "", "## Open questions", "", list(r.openQuestions), "");
  return out.join("\n");
}
