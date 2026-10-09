import crypto from "node:crypto";
import path from "node:path";
import { STAGES, isAvailable, stageById, type StageId } from "../stages";
import { agentForStage, loadPrompt } from "../agents/registry";
import type { AgentContext } from "../agents/types";
import { getApproved, getLatest, getVersion, saveVersion, setApproved, type ArtifactVersion } from "../storage/artifacts";
import {
  getBrief, getProject, listUploads, logDecision, replaceStageState, touchProject, type RunMode,
} from "../storage/projects";
import { projectDir } from "../storage/paths";
import { appendLine } from "../storage/fs";
import { getRun, insertCall, insertRun, listRuns, markOrphanedRuns, updateRun, type RunRow } from "../storage/db";
import { emit } from "../runtime/events";
import { budgetFor, isReplayMode, modelFor } from "../runtime/models";
import { isTransient, type Provider } from "../runtime/provider";
import { sdkProvider } from "../runtime/sdk-provider";
import { replayProvider } from "../runtime/replay-provider";
import { currentInputs, stageStates } from "./status";

// The orchestrator is plain code, not an LLM: it runs stages in order, enforces approval
// gates and definitions of done, retries, tracks cost against the budget and logs every call.

const MAX_TRANSIENT_ATTEMPTS = 3;
const MAX_DOD_REVISIONS = 1;

interface ActiveRun {
  abort: AbortController;
  stage: StageId | null;
}

const g = globalThis as unknown as { __uxActive?: Map<string, ActiveRun> };
const active = (g.__uxActive ??= new Map());
// Runs left "running" by a previous server process can't continue; mark them stopped once,
// on first use (not at import, so the database location can still be configured).
let orphansChecked = false;
function checkOrphans(): void {
  if (orphansChecked) return;
  orphansChecked = true;
  markOrphanedRuns(new Set(active.keys()));
}

export function runningStages(slug: string): Set<StageId> {
  checkOrphans();
  const set = new Set<StageId>();
  for (const [id, run] of active) {
    if (run.stage && getRun(id)?.project === slug) set.add(run.stage);
  }
  return set;
}

export function activeRunIds(): Set<string> {
  return new Set(active.keys());
}

function provider(): Provider {
  return isReplayMode() ? replayProvider : sdkProvider;
}

const backoff = (attempt: number) => new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));

export interface StartRunOptions {
  /** Which stages to run. Defaults to every available stage that isn't approved yet. */
  stages?: StageId[];
  mode?: RunMode;
  /** Notes for a revision run of a single stage. */
  notes?: string;
}

/** Start a run in the background. Returns the run id immediately. */
export async function startRun(slug: string, opts: StartRunOptions = {}): Promise<string> {
  checkOrphans();
  const project = await getProject(slug);
  if (!project) throw new Error("Project not found");
  for (const r of listRuns(slug, 5)) {
    if (r.status === "running" && active.has(r.id)) throw new Error("A run is already in progress for this project.");
  }
  let requested = opts.stages;
  if (!requested) {
    // Pick up from the first stage that isn't approved and current.
    const states = await stageStates(slug);
    const first = states.findIndex((s) => s.status !== "approved" && s.status !== "coming_soon");
    if (first === -1) throw new Error("Every available stage is approved and up to date. Run a single stage to redo it.");
    requested = states.slice(first).filter((s) => s.status !== "coming_soon").map((s) => s.stage);
  }
  const stages = requested.filter((s) => {
    const def = stageById(s);
    return def && isAvailable(def);
  });
  if (!stages.length) throw new Error("Nothing to run: the selected stages are not available yet.");

  const id = `run_${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}_${crypto.randomBytes(3).toString("hex")}`;
  insertRun({
    id, project: slug, mode: opts.mode ?? project.mode, stages: JSON.stringify(stages), status: "running",
    replay: isReplayMode() ? 1 : 0, budget_usd: budgetFor(project), started_at: new Date().toISOString(),
  });
  await logDecision(slug, `Run started (${id})`, `Stages: ${stages.join(", ")}. Mode: ${opts.mode ?? project.mode}.${isReplayMode() ? " Replay mode." : ""}`);
  void drive(id, stages, opts.notes);
  return id;
}

/** Continue a run that paused at an approval gate. */
async function resumeAfterApproval(slug: string, approvedStage: StageId): Promise<void> {
  const waiting = listRuns(slug, 10).find((r) => r.status === "waiting_approval" && r.current_stage === approvedStage);
  if (!waiting) return;
  const stages = JSON.parse(waiting.stages) as StageId[];
  const rest = stages.slice(stages.indexOf(approvedStage) + 1);
  if (!rest.length) {
    finish(waiting, "done");
    return;
  }
  updateRun(waiting.id, { status: "running" });
  emit(slug, { type: "run", runId: waiting.id, status: "running" });
  void drive(waiting.id, rest);
}

function finish(run: RunRow, status: "done" | "failed" | "stopped", error?: string): void {
  updateRun(run.id, { status, error: error ?? null, finished_at: new Date().toISOString(), current_stage: null });
  emit(run.project, { type: "run", runId: run.id, status, error });
}

async function drive(runId: string, stages: StageId[], notes?: string): Promise<void> {
  const run = getRun(runId)!;
  const slug = run.project;
  const abort = new AbortController();
  active.set(runId, { abort, stage: null });
  try {
    for (const stage of stages) {
      const latestRun = getRun(runId)!;
      if (latestRun.budget_usd !== null && latestRun.cost_usd >= latestRun.budget_usd) {
        finish(latestRun, "stopped", `Spending cap of $${latestRun.budget_usd.toFixed(2)} reached. Raise it in settings or run the remaining stages.`);
        return;
      }
      active.get(runId)!.stage = stage;
      updateRun(runId, { current_stage: stage });
      emit(slug, { type: "stage", runId, stage, status: "running" });

      const result = await runStage(runId, slug, stage, abort.signal, stages.length === 1 ? notes : undefined);
      active.get(runId)!.stage = null;
      emit(slug, { type: "changed" });

      if (!result.ok) {
        finish(getRun(runId)!, abort.signal.aborted ? "stopped" : "failed", result.error);
        return;
      }
      const mode = run.mode as RunMode;
      if (mode === "unattended" && result.version.meta.dod.passed) {
        await setApproved(slug, stage, result.version.meta.version);
        await logDecision(slug, `${stageById(stage)!.title} v${result.version.meta.version} auto-approved`, "Unattended run; all done-checks passed.");
        continue;
      }
      // Approval gate: pause here; approving the stage continues the run.
      updateRun(runId, { status: "waiting_approval", current_stage: stage });
      emit(slug, { type: "run", runId, status: "waiting_approval", stage });
      return;
    }
    finish(getRun(runId)!, "done");
  } catch (err) {
    finish(getRun(runId)!, "failed", err instanceof Error ? err.message : String(err));
  } finally {
    active.delete(runId);
    await touchProject(slug).catch(() => {});
  }
}

type StageResult = { ok: true; version: ArtifactVersion } | { ok: false; error: string };

async function buildContext(slug: string, stage: StageId): Promise<AgentContext> {
  const project = (await getProject(slug))!;
  const def = stageById(stage)!;
  const upstream: AgentContext["upstream"] = {};
  for (const dep of def.dependsOn) {
    const v = await getApproved(slug, dep);
    if (!v) throw new Error(`${stageById(dep)!.title} must be approved before ${def.title} can run.`);
    upstream[dep] = v;
  }
  return {
    project,
    brief: await getBrief(slug),
    uploads: (await listUploads(slug)).map((u) => u.name),
    projectDir: projectDir(slug),
    upstream,
  };
}

async function runStage(runId: string, slug: string, stage: StageId, signal: AbortSignal, notes?: string): Promise<StageResult> {
  const agent = agentForStage(stage);
  if (!agent) return { ok: false, error: `No agent for ${stage} yet.` };
  const ctx = await buildContext(slug, stage);
  const inputs = await currentInputs(slug, stage);
  if (notes) {
    const prev = await getLatest(slug, stage);
    if (prev) ctx.revision = { previous: prev.data, notes };
  }
  const prompt = await loadPrompt(agent.id);
  const model = modelFor(agent.id, ctx.project);
  const promptHash = crypto.createHash("sha256").update(prompt.raw).digest("hex").slice(0, 12);
  const callsLog = path.join(projectDir(slug), "runs", runId, "calls.jsonl");

  let attempt = 0;
  let revisions = 0;
  for (;;) {
    attempt++;
    const run = getRun(runId)!;
    const remaining = Math.max(0.05, (run.budget_usd ?? 1000) - run.cost_usd);
    const task = agent.buildTask(ctx);
    const startedAt = new Date().toISOString();
    const result = await provider().run({
      agentId: agent.id, model, systemPrompt: prompt.body, task, schema: agent.schema, tools: agent.tools,
      subagents: agent.subagents?.(ctx) ?? {}, maxTurns: prompt.maxTurns, maxBudgetUsd: remaining, cwd: ctx.projectDir,
      signal,
      onEvent: (e) =>
        e.kind === "text"
          ? emit(slug, { type: "text", runId, stage, text: e.text })
          : emit(slug, { type: "tool", runId, stage, name: e.name, summary: e.summary }),
      replayKey: { project: slug, agentId: agent.id },
    });

    const callId = `${runId}_${stage}_${attempt}`;
    insertCall({
      id: callId, run_id: runId, project: slug, stage, agent: agent.id, model: result.model, attempt,
      status: result.error ? "error" : "ok", input_tokens: result.inputTokens, output_tokens: result.outputTokens,
      cache_read_tokens: result.cacheReadTokens, cache_write_tokens: result.cacheWriteTokens, cost_usd: result.costUsd,
      duration_ms: result.durationMs, error: result.error ?? null, prompt_hash: promptHash, started_at: startedAt,
    });
    await appendLine(callsLog, JSON.stringify({
      id: callId, stage, agent: agent.id, model: result.model, attempt, startedAt, promptHash, systemPrompt: prompt.body,
      task, output: result.output, error: result.error, costUsd: result.costUsd, durationMs: result.durationMs,
      tokens: { input: result.inputTokens, output: result.outputTokens, cacheRead: result.cacheReadTokens, cacheWrite: result.cacheWriteTokens },
      replay: result.replay,
    }));
    emit(slug, { type: "cost", runId, costUsd: getRun(runId)!.cost_usd });

    if (signal.aborted) return { ok: false, error: "Stopped." };
    if (result.error || result.output === null) {
      const error = result.error ?? "No output";
      if (!result.replay && isTransient(error) && attempt < MAX_TRANSIENT_ATTEMPTS) {
        emit(slug, { type: "stage", runId, stage, status: "retrying", detail: error });
        await backoff(attempt);
        continue;
      }
      return { ok: false, error };
    }

    const dod = await agent.dod(result.output, ctx);
    const version = await saveVersion(
      slug, stage,
      { author: "agent", inputs: inputs as Record<string, string | number>, dod, runId, model: result.model, costUsd: result.costUsd, replay: result.replay },
      result.output,
      agent.toMarkdown(result.output),
    );
    const st = agent.extractState(result.output);
    await replaceStageState(slug, stage, st.assumptions, st.questions);

    if (!dod.passed && revisions < MAX_DOD_REVISIONS && !result.replay) {
      // One automatic revision: send the failed checks back to the agent.
      revisions++;
      const failed = dod.checks.filter((c) => !c.passed).map((c) => `- ${c.label}${c.detail ? `: ${c.detail}` : ""}`).join("\n");
      ctx.revision = { previous: result.output, notes: `These done-checks failed:\n${failed}` };
      emit(slug, { type: "stage", runId, stage, status: "revising", detail: failed });
      continue;
    }
    await logDecision(slug, `${stageById(stage)!.title} v${version.meta.version} produced`, dod.passed ? "All done-checks passed." : "Some done-checks failed.");
    emit(slug, { type: "stage", runId, stage, status: dod.passed ? "needs_review" : "checks_failed" });
    return { ok: true, version };
  }
}

export function stopRun(runId: string): void {
  active.get(runId)?.abort.abort();
  const run = getRun(runId);
  if (run && run.status === "waiting_approval") finish(run, "stopped");
}

export async function approveStage(slug: string, stage: StageId, version: number, override = false): Promise<void> {
  const v = await getVersion(slug, stage, version);
  if (!v) throw new Error("Version not found");
  if (!v.meta.dod.passed && !override) throw new Error("This version hasn't passed its done-checks. Fix it, or approve anyway with an override.");
  await setApproved(slug, stage, version);
  await logDecision(slug, `${stageById(stage)!.title} v${version} approved`, override && !v.meta.dod.passed ? "Approved with failing checks (override)." : "");
  emit(slug, { type: "changed" });
  await resumeAfterApproval(slug, stage);
}

/** Save a hand edit as a new version, re-running the done-checks on it. */
export async function saveEdit(slug: string, stage: StageId, data: unknown, basedOn: number, note?: string): Promise<ArtifactVersion> {
  const agent = agentForStage(stage);
  if (!agent) throw new Error("Unknown stage");
  const parsed = agent.schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  const ctx = await buildContext(slug, stage);
  const dod = await agent.dod(parsed.data, ctx);
  // A hand edit is taken to reflect the current upstream work, so it clears "out of date".
  const inputs = (await currentInputs(slug, stage)) as Record<string, string | number>;
  const version = await saveVersion(
    slug, stage,
    { author: "me", inputs, dod, basedOn, note },
    parsed.data,
    agent.toMarkdown(parsed.data),
  );
  const st = agent.extractState(parsed.data);
  await replaceStageState(slug, stage, st.assumptions, st.questions);
  await logDecision(slug, `${stageById(stage)!.title} edited by hand → v${version.meta.version}`, note ?? "");
  emit(slug, { type: "changed" });
  return version;
}
