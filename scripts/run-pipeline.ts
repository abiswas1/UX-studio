// Runs the pipeline unattended on the sample briefs so you can test prompt changes.
//
//   npm run pipeline                      # all sample briefs
//   npm run pipeline -- --brief clinic-booking
//   npm run pipeline -- --label "shorter researcher prompt"
//
// Without an API key (or with UXSTUDIO_REPLAY=1) it plays back recorded output instead.
// Results go to <UXSTUDIO_HOME>/eval-runs/<timestamp>/report.md and report.json.
import path from "node:path";
import { listSamples } from "../lib/samples";
import { createProject } from "../lib/storage/projects";
import { getRun, listCalls } from "../lib/storage/db";
import { getLatest, listVersions } from "../lib/storage/artifacts";
import type { Critique } from "../agents/critic/schema";
import { startRun } from "../lib/orchestrator/orchestrator";
import { stageStates } from "../lib/orchestrator/status";
import { isReplayMode } from "../lib/runtime/models";
import { writeJson, writeFileAtomic } from "../lib/storage/fs";
import { homeDir } from "../lib/storage/paths";
import { loadPrompt } from "../lib/agents/registry";
import { STAGES, isAvailable } from "../lib/stages";
import crypto from "node:crypto";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (process.env.UXSTUDIO_REPLAY_SPEED === undefined) process.env.UXSTUDIO_REPLAY_SPEED = "0";
  const only = arg("brief");
  const label = arg("label") ?? "";
  const samples = (await listSamples()).filter((s) => !only || s.id === only);
  if (!samples.length) throw new Error(`No sample brief "${only}"`);

  const promptHashes: Record<string, string> = {};
  for (const s of STAGES.filter(isAvailable)) {
    const p = await loadPrompt(s.agent);
    promptHashes[s.agent] = crypto.createHash("sha256").update(p.raw).digest("hex").slice(0, 12);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = path.join(homeDir(), "eval-runs", stamp);
  console.log(`UX Studio pipeline · ${isReplayMode() ? "REPLAY mode (recorded output)" : "LIVE mode"} · ${samples.length} brief(s)\n`);

  const results = [];
  for (const s of samples) {
    const project = await createProject({ name: `${s.name} · eval ${stamp}`, brief: s.brief, platforms: s.platforms, mode: "unattended", sampleId: s.id });
    process.stdout.write(`▶ ${s.name} … `);
    const started = Date.now();
    const runId = await startRun(project.slug, { mode: "unattended" });
    let run = getRun(runId)!;
    while (run.status === "running") {
      await sleep(250);
      run = getRun(runId)!;
    }
    const states = await stageStates(project.slug);
    const stages = [];
    for (const st of states.filter((x) => x.status !== "coming_soon")) {
      const latest = await getLatest(project.slug, st.stage);
      stages.push({
        stage: st.stage,
        status: st.status,
        checks: latest?.meta.dod.checks.map((c) => ({ id: c.id, passed: c.passed, detail: c.detail })) ?? [],
      });
    }
    const calls = listCalls(runId);
    const critique = await getLatest<Critique>(project.slug, "critique");
    const critiqueRounds = Math.max(0, (await listVersions(project.slug, "critique")).length - 1);
    const openSerious = critique ? critique.data.findings.filter((f) => f.severity >= 3).length : null;
    const result = {
      brief: s.id, project: project.slug, runId, status: run.status, error: run.error, costUsd: run.cost_usd,
      seconds: Math.round((Date.now() - started) / 100) / 10, attempts: calls.length, critiqueRounds, openSerious, stages,
    };
    results.push(result);
    console.log(`${run.status}${run.error ? ` — ${run.error}` : ""} · $${run.cost_usd.toFixed(2)} · ${result.seconds}s` +
      (critique ? ` · critique rounds ${critiqueRounds}, serious issues left ${openSerious}` : ""));
    for (const st of stages) {
      const failed = st.checks.filter((c) => !c.passed);
      console.log(`   ${st.stage.padEnd(14)} ${st.status.padEnd(14)} checks ${st.checks.length - failed.length}/${st.checks.length}`);
      for (const f of failed) console.log(`      ✗ ${f.id}: ${f.detail ?? ""}`);
    }
  }

  const report = { label, replay: isReplayMode(), promptHashes, createdAt: new Date().toISOString(), results };
  await writeJson(path.join(outDir, "report.json"), report);
  const md = [
    `# Pipeline eval ${stamp}${label ? ` — ${label}` : ""}`, "",
    `Mode: ${report.replay ? "replay (recorded output)" : "live"}`, "",
    `Prompt versions: ${Object.entries(promptHashes).map(([a, h]) => `${a} ${h}`).join(", ")}`, "",
    "| Brief | Status | Cost | Time | Checks passed | Critique rounds | Serious issues left |", "| --- | --- | --- | --- | --- | --- | --- |",
    ...results.map((r) => {
      const all = r.stages.flatMap((st) => st.checks);
      return `| ${r.brief} | ${r.status} | $${r.costUsd.toFixed(2)} | ${r.seconds}s | ${all.filter((c) => c.passed).length}/${all.length} | ${r.critiqueRounds} | ${r.openSerious ?? "—"} |`;
    }),
  ].join("\n");
  await writeFileAtomic(path.join(outDir, "report.md"), md + "\n");
  console.log(`\nReport: ${path.join(outDir, "report.md")}`);
  process.exit(results.every((r) => r.status === "done") ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
