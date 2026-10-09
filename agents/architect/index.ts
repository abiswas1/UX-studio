import type { AgentModule } from "../../lib/agents/types";
import { list, stageTask } from "../../lib/agents/helpers";
import { ArchitectureSchema, type Architecture } from "./schema";
import { architectureDod } from "./dod";
import { sitemapMermaid } from "./sitemap";

function toMarkdown(a: Architecture): string {
  const out = ["# Architecture", "", "## Journeys", ""];
  for (const j of a.journeys) {
    out.push(`### ${j.id}. ${j.persona}: ${j.goal}`, "", "| Stage | Actions | Pain points | Opportunities |", "| --- | --- | --- | --- |");
    for (const s of j.stages) out.push(`| ${s.stage} | ${s.actions.join("; ")} | ${s.painPoints.join("; ")} | ${s.opportunities.join("; ")} |`);
    out.push("");
  }
  out.push("## Task flows", "");
  for (const f of a.flows) {
    out.push(`### ${f.id}. ${f.name}`, "", `Trigger: ${f.trigger}`, "", "```mermaid", f.mermaid.trim(), "```", "", list(f.steps.map((s, i) => `${i + 1}. ${s}`)), "");
  }
  out.push("## Sitemap", "", "```mermaid", sitemapMermaid(a), "```", "");
  out.push("## Screen inventory", "", "| Screen | Priority | Primary action | States |", "| --- | --- | --- | --- |");
  for (const s of a.screens) out.push(`| ${s.name} (\`${s.id}\`) | ${s.priority} | ${s.primaryAction} | ${s.states.map((x) => x.state).join(", ")} |`);
  out.push("");
  for (const s of a.screens) {
    out.push(`### ${s.name} · ${s.priority}`, "", s.purpose, "", "**Key content**", "", list(s.keyContent), "", "**States**", "", list(s.states.map((x) => `${x.state}: ${x.description}`)), "");
    if (s.statesNotNeeded.length) out.push("**States not needed**", "", list(s.statesNotNeeded.map((x) => `${x.state}: ${x.reason}`)), "");
  }
  out.push("## Assumptions", "", list(a.assumptions), "", "## Open questions", "", list(a.openQuestions), "");
  return out.join("\n");
}

export const architect: AgentModule<Architecture> = {
  id: "architect",
  stage: "architecture",
  schema: ArchitectureSchema,
  tools: [],
  buildTask: (ctx) =>
    stageTask(ctx, {
      inputs: [{ stage: "research", label: "Research" }],
      instructions:
        "Turn the research into the product's structure: journeys for the key personas, task flows for the most important jobs, " +
        "a sitemap and a prioritised screen inventory with every state each screen can be in.",
    }),
  dod: (data) => architectureDod(data),
  toMarkdown,
  extractState: (d) => ({ assumptions: d.assumptions, questions: d.openQuestions }),
};
