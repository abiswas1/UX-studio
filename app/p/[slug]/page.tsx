import Link from "next/link";
import { notFound } from "next/navigation";
import { getAssumptions, getBrief, getDecisions, getOpenQuestions, getProject, listUploads } from "@/lib/storage/projects";
import { stageStates } from "@/lib/orchestrator/status";
import { runningStages } from "@/lib/orchestrator/orchestrator";
import { listRuns, projectCost } from "@/lib/storage/db";
import { isReplayMode, modelFor } from "@/lib/runtime/models";
import { STAGES } from "@/lib/stages";
import { PipelineClient } from "@/components/PipelineClient";

export const dynamic = "force-dynamic";

export default async function PipelinePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await getProject(slug);
  if (!project) notFound();

  const [brief, uploads, states, assumptions, questions, decisions] = await Promise.all([
    getBrief(slug), listUploads(slug), stageStates(slug, runningStages(slug)), getAssumptions(slug), getOpenQuestions(slug), getDecisions(slug),
  ]);
  const runs = listRuns(slug, 8);
  const activeRun = runs.find((r) => r.status === "running" || r.status === "waiting_approval") ?? null;

  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand">UX Studio</Link>
        <nav className="crumbs" aria-label="Breadcrumb"><span>/</span><span>{project.name}</span></nav>
        <span className="spacer" />
        {isReplayMode() && <span className="badge replay" title="No API key found: runs play back recorded sample output">Replay mode</span>}
        <span className="faint">Press <kbd>?</kbd> for shortcuts</span>
      </header>
      <PipelineClient
        project={project}
        brief={brief}
        uploads={uploads}
        stages={STAGES.map((def) => {
          const st = states.find((s) => s.stage === def.id)!;
          return {
            id: def.id, order: def.order, title: def.title, summary: def.summary, status: st.status,
            latest: st.latest, approved: st.approved, staleBecause: st.staleBecause ?? [],
            dod: st.latestMeta?.dod ?? null, author: st.latestMeta?.author ?? null, replay: !!st.latestMeta?.replay,
            model: modelFor(def.agent, project),
          };
        })}
        runs={runs.map((r) => ({ id: r.id, status: r.status, stage: r.current_stage, error: r.error, cost: r.cost_usd, budget: r.budget_usd, startedAt: r.started_at, replay: !!r.replay }))}
        activeRunId={activeRun?.id ?? null}
        totalCost={projectCost(slug)}
        assumptions={assumptions}
        questions={questions}
        decisions={decisions.split("\n").filter((l) => l.startsWith("- ")).slice(-8).reverse()}
      />
    </>
  );
}
