import type { DodCheck, DodResult } from "../../lib/storage/artifacts";
import type { Research } from "./schema";

export interface ResearchDodContext {
  uploads: string[];
}

// Definition of done for the research stage. The orchestrator runs this on every version
// (agent-made or hand-edited) and blocks approval until it passes.
export function researchDod(r: Research, ctx: ResearchDodContext): DodResult {
  const checks: DodCheck[] = [];
  const add = (id: string, label: string, passed: boolean, detail?: string) =>
    checks.push({ id, label, passed, detail: passed ? undefined : detail });

  add("competitors", "At least 3 competitors or alternatives", r.competitors.length >= 3, `Found ${r.competitors.length}.`);

  const unsourced = r.competitors.filter((c) => !c.sources.some((s) => /^https?:\/\//.test(s.url)));
  add("citations", "Every competitor has a cited source", unsourced.length === 0, `Missing sources: ${unsourced.map((c) => c.name).join(", ")}.`);

  add("personas", "2 to 4 personas", r.personas.length >= 2 && r.personas.length <= 4, `Found ${r.personas.length}.`);

  // Never invent user data: without uploads there is no first-hand evidence about users.
  const fakeEvidence = ctx.uploads.length === 0 ? r.personas.filter((p) => p.basis === "evidence") : [];
  add(
    "no-invented-users",
    "Personas without research uploads are labelled as assumptions",
    fakeEvidence.length === 0,
    `No research was uploaded, but these personas claim evidence: ${fakeEvidence.map((p) => p.name).join(", ")}.`,
  );

  add("jobs", "At least 3 jobs-to-be-done", r.jobs.length >= 3, `Found ${r.jobs.length}.`);

  const weakInsights = r.insights.filter((i) => !i.implication.trim() || (i.basis === "evidence" && i.supportedBy.length === 0));
  add("insights", "At least 3 insights, each with a design implication", r.insights.length >= 3 && weakInsights.length === 0,
    r.insights.length < 3 ? `Found ${r.insights.length}.` : `Missing implication or support: ${weakInsights.map((i) => i.id).join(", ")}.`);

  const ids = new Set(r.insights.map((i) => i.id));
  const badHmw = r.hmw.filter((h) => !/^how might we\b/i.test(h.question.trim()) || h.linkedInsights.some((id) => !ids.has(id)));
  add("hmw", "3 to 7 'How might we' questions, each linked to an insight", r.hmw.length >= 3 && r.hmw.length <= 7 && badHmw.length === 0,
    r.hmw.length < 3 || r.hmw.length > 7 ? `Found ${r.hmw.length}.` : `Check wording or links: ${badHmw.map((h) => h.question).join(" | ")}`);

  const covered = new Set(r.uploadsSynthesis.map((u) => u.file));
  const missed = ctx.uploads.filter((u) => !covered.has(u));
  add("uploads", "Every uploaded file is synthesised", missed.length === 0, `Not covered: ${missed.join(", ")}.`);

  add("assumptions", "Assumptions are listed", r.assumptions.length > 0, "List what was assumed without evidence.");

  return { passed: checks.every((c) => c.passed), checks };
}
