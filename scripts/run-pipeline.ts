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
  const previous = await previousReport(path.join(homeDir(), "eval-runs"), stamp);
  await writeJson(path.join(outDir, "report.json"), report);
  const md: string[] = [
    `# Pipeline eval ${stamp}${label ? ` — ${label}` : ""}`, "",
    `Mode: ${report.replay ? "replay (recorded output)" : "live"}`, "",
    `Prompt versions: ${Object.entries(promptHashes).map(([a, h]) => `${a} ${h}`).join(", ")}`, "",
    "| Brief | Status | Cost | Time | Checks passed | Critique rounds | Serious issues left |", "| --- | --- | --- | --- | --- | --- | --- |",
    ...results.map((r) => {
      const all = r.stages.flatMap((st) => st.checks);
      return `| ${r.brief} | ${r.status} | $${r.costUsd.toFixed(2)} | ${r.seconds}s | ${all.filter((c) => c.passed).length}/${all.length} | ${r.critiqueRounds} | ${r.openSerious ?? "—"} |`;
    }),
  ];
  if (previous) {
    const changed = Object.keys(promptHashes).filter((a) => previous.report.promptHashes?.[a] && previous.report.promptHashes[a] !== promptHashes[a]);
    const lines = [`Compared with the previous run (${previous.stamp}${previous.report.label ? ` — ${previous.report.label}` : ""}):`];
    lines.push(`- Instructions changed for: ${changed.length ? changed.join(", ") : "no agents"}`);
    for (const r of results) {
      const p = previous.report.results.find((x) => x.brief === r.brief);
      if (!p) continue;
      const pass = (x: { stages: { checks: { passed: boolean }[] }[] }) => x.stages.flatMap((st) => st.checks).filter((c) => c.passed).length;
      const delta = (a: number, b: number, unit = "") => (a === b ? "same" : `${a > b ? "+" : ""}${Math.round((a - b) * 100) / 100}${unit}`);
      lines.push(`- ${r.brief}: checks passed ${delta(pass(r), pass(p))}, serious issues left ${delta(r.openSerious ?? 0, p.openSerious ?? 0)}, cost ${delta(r.costUsd, p.costUsd, " $")}, status ${p.status} → ${r.status}`);
    }
    console.log("\n" + lines.join("\n"));
    md.push("", ...lines);
  }
  await writeFileAtomic(path.join(outDir, "report.md"), md.join("\n") + "\n");
  console.log(`\nReport: ${path.join(outDir, "report.md")}`);
  process.exit(results.every((r) => r.status === "done") ? 0 : 1);
}

type EvalReport = { label: string; promptHashes: Record<string, string>; results: { brief: string; status: string; costUsd: number; openSerious: number | null; stages: { checks: { passed: boolean }[] }[] }[] };

/** The most recent earlier eval report, if any, for "compared with last run". */
async function previousReport(dir: string, current: string): Promise<{ stamp: string; report: EvalReport } | null> {
  const fs = await import("node:fs/promises");
  const stamps = (await fs.readdir(dir).catch(() => [] as string[])).filter((d) => d < current).sort().reverse();
  for (const stamp of stamps) {
    const raw = await fs.readFile(path.join(dir, stamp, "report.json"), "utf8").catch(() => null);
    if (raw) return { stamp, report: JSON.parse(raw) };
  }
  return null;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
