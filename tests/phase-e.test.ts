import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createProject } from "../lib/storage/projects";
import { startRun } from "../lib/orchestrator/orchestrator";
import { getRun } from "../lib/storage/db";
import { getApproved } from "../lib/storage/artifacts";
import { stageStates } from "../lib/orchestrator/status";
import { listSamples } from "../lib/samples";
import { buildReport, writeReportMarkdown } from "../lib/export/report";
import { markdownToHtml } from "../lib/export/markdown-html";
import { listPromptHistory, readPromptHistory, updateModels, updatePrompt } from "../lib/agents/settings";
import { loadPrompt, savePrompt } from "../lib/agents/registry";
import { projectDir } from "../lib/storage/paths";
import type { Critique } from "../agents/critic/schema";

process.env.UXSTUDIO_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "uxs-test-e-"));
process.env.UXSTUDIO_REPLAY = "1";
process.env.UXSTUDIO_REPLAY_SPEED = "0";

async function runUnattended(sampleId: string) {
  const sample = (await listSamples()).find((s) => s.id === sampleId)!;
  const project = await createProject({ name: `${sample.name} ${Math.random().toString(36).slice(2, 7)}`, brief: sample.brief, platforms: sample.platforms, mode: "unattended", sampleId });
  const runId = await startRun(project.slug, { mode: "unattended" });
  let run = getRun(runId)!;
  while (run.status === "running") {
    await new Promise((r) => setTimeout(r, 50));
    run = getRun(runId)!;
  }
  return { project, run };
}

// Every sample brief with recordings must run end to end: all stages approved, every
// done-check passing, and no serious critique findings left after the critique loop.
for (const sampleId of ["medication-reminders", "invoice-reconciliation", "clinic-booking"]) {
  const recorded = fs.existsSync(`fixtures/replay/prototyper/${sampleId}.json`);
  test(`replay pipeline completes for ${sampleId}`, { skip: !recorded && "no recordings yet" }, async () => {
    const { project, run } = await runUnattended(sampleId);
    assert.equal(run.status, "done", run.error ?? "");
    const states = await stageStates(project.slug);
    for (const s of states) assert.equal(s.status, "approved", `${s.stage} is ${s.status}`);
    const critique = await getApproved<Critique>(project.slug, "critique");
    assert.equal(critique!.data.findings.filter((f) => f.severity >= 3).length, 0);
    assert.ok(fs.existsSync(path.join(projectDir(project.slug), "exports", "prototype", "index.html")));
  });
}

test("the report brings every stage together and is saved as Markdown", async () => {
  const { project } = await runUnattended("medication-reminders");
  const report = (await buildReport(project.slug))!;
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.sections.map((s) => s.title), ["Research", "Architecture", "Content", "Wireframes", "Design system", "UI", "Critique", "Prototype"]);
  assert.ok(report.sections.every((s) => s.approved));
  // Stage headings sit under the report's own level-2 headings.
  assert.ok(!/^# (?!Dose)/m.test(report.markdown.replace(/```[\s\S]*?```/g, "")));
  assert.match(report.markdown, /^## Brief$/m);
  assert.match(report.markdown, /^### Decision log$/m);
  const md = await writeReportMarkdown(project.slug);
  assert.equal(fs.readFileSync(path.join(projectDir(project.slug), "exports", "report.md"), "utf8"), md);
  const html = markdownToHtml(report.markdown);
  assert.match(html, /<pre class="mermaid-src">flowchart/);
  assert.match(html, /<table>/);
});

test("raw HTML in agent output is shown as text in the report", () => {
  const html = markdownToHtml("Hello\n\n<script>alert(1)</script>\n\nand <b>inline</b>");
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<b>"));
});

test("saving an agent's instructions keeps the previous text", async () => {
  const original = (await loadPrompt("critic")).raw;
  try {
    await updatePrompt("critic", original + "\nExtra line for the test.\n");
    const history = await listPromptHistory("critic");
    assert.equal(history.length, 1);
    assert.equal(await readPromptHistory("critic", history[0].id), original);
    await updatePrompt("critic", original + "\nExtra line for the test.\n"); // unchanged: no new entry
    assert.equal((await listPromptHistory("critic")).length, 1);
  } finally {
    await savePrompt("critic", original);
  }
  await assert.rejects(updatePrompt("critic", "  "), /can't be empty/);
  await assert.rejects(updatePrompt("nobody", "x"), /Unknown agent/);
});

test("model settings reject unknown tiers and odd model ids", async () => {
  await assert.rejects(updateModels({ agent: "critic", tier: "huge" }), /Unknown tier/);
  await assert.rejects(updateModels({ tiers: { draft: "not a model!" } }), /model id/);
  await assert.rejects(updateModels({ budgetUsdPerRun: 0 }), /more than/);
});
