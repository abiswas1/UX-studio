import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";


import { ResearchSchema } from "../agents/researcher/schema";
import { researchDod } from "../agents/researcher/dod";
import { createProject, setBrief } from "../lib/storage/projects";
import { startRun, approveStage, saveEdit } from "../lib/orchestrator/orchestrator";
import { stageStates } from "../lib/orchestrator/status";
import { getRun } from "../lib/storage/db";
import { listVersions, getLatest } from "../lib/storage/artifacts";
import { getSample } from "../lib/samples";

// Settings are read lazily, so setting them after the imports is fine.
process.env.UXSTUDIO_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "uxs-test-"));
process.env.UXSTUDIO_REPLAY = "1";
process.env.UXSTUDIO_REPLAY_SPEED = "0";

const fixture = JSON.parse(fs.readFileSync("fixtures/replay/researcher/medication-reminders.json", "utf8")).output;

async function waitForRun(id: string) {
  for (let i = 0; i < 2400; i++) {
    const r = getRun(id)!;
    if (r.status !== "running") return r;
    await new Promise((res) => setTimeout(res, 25));
  }
  throw new Error("run did not finish");
}

test("recorded research matches the schema and passes its done-checks", () => {
  const data = ResearchSchema.parse(fixture);
  const dod = researchDod(data, { uploads: [] });
  assert.equal(dod.passed, true, JSON.stringify(dod.checks.filter((c) => !c.passed)));
});

test("personas may not claim evidence when nothing was uploaded", () => {
  const data = ResearchSchema.parse(structuredClone(fixture));
  data.personas[0].basis = "evidence";
  const dod = researchDod(data, { uploads: [] });
  assert.equal(dod.passed, false);
  assert.equal(dod.checks.find((c) => c.id === "no-invented-users")?.passed, false);
});

test("every uploaded file must be synthesised", () => {
  const data = ResearchSchema.parse(fixture);
  const dod = researchDod(data, { uploads: ["interviews.pdf"] });
  assert.equal(dod.checks.find((c) => c.id === "uploads")?.passed, false);
});

test("run → review gate → approve → edit → brief change marks research out of date", async () => {
  const sample = (await getSample("medication-reminders"))!;
  const p = await createProject({ name: "Test", brief: sample.brief, platforms: sample.platforms, sampleId: sample.id });

  const run = await waitForRun(await startRun(p.slug));
  assert.equal(run.status, "waiting_approval");
  let research = (await stageStates(p.slug)).find((s) => s.stage === "research")!;
  assert.equal(research.status, "needs_review");

  await approveStage(p.slug, "research", 1);
  // Approving continues the run to the next stage, which then waits for review.
  await waitForRun(run.id);
  assert.equal(getRun(run.id)!.status, "waiting_approval");
  assert.equal(getRun(run.id)!.current_stage, "architecture");
  research = (await stageStates(p.slug)).find((s) => s.stage === "research")!;
  assert.equal(research.status, "approved");

  const latest = (await getLatest<typeof fixture>(p.slug, "research"))!;
  const edited = { ...latest.data, assumptions: [...latest.data.assumptions, "New assumption"] };
  const v2 = await saveEdit(p.slug, "research", edited, 1, "added an assumption");
  assert.equal(v2.meta.version, 2);
  assert.equal(v2.meta.author, "me");
  assert.equal((await listVersions(p.slug, "research")).length, 2);

  await setBrief(p.slug, sample.brief + "\nAlso support as-needed medications.");
  research = (await stageStates(p.slug)).find((s) => s.stage === "research")!;
  assert.equal(research.status, "stale");
});

test("hand edits that break the schema are rejected", async () => {
  const sample = (await getSample("medication-reminders"))!;
  const p = await createProject({ name: "Test 2", brief: sample.brief, platforms: sample.platforms, sampleId: sample.id });
  await waitForRun(await startRun(p.slug));
  await assert.rejects(saveEdit(p.slug, "research", { problem: {} }, 1));
});

test("replay mode refuses projects without a recording instead of inventing output", async () => {
  const p = await createProject({ name: "Own brief", brief: "A brand new idea that has no recording at all.", platforms: ["web"] });
  const run = await waitForRun(await startRun(p.slug));
  assert.equal(run.status, "failed");
  assert.match(run.error ?? "", /sample briefs/);
});
