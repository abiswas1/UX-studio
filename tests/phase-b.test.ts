import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ArchitectureSchema } from "../agents/architect/schema";
import { architectureDod } from "../agents/architect/dod";
import { ContentSchema } from "../agents/content/schema";
import { contentDod } from "../agents/content";
import { WireframesSchema } from "../agents/wireframer/schema";
import { wireframesDod } from "../agents/wireframer";
import { checkMermaid } from "../lib/mermaid";
import { createProject } from "../lib/storage/projects";
import { startRun } from "../lib/orchestrator/orchestrator";
import { stageStates } from "../lib/orchestrator/status";
import { getRun } from "../lib/storage/db";
import { getSample } from "../lib/samples";

// Settings are read lazily, so setting them after the imports is fine.
process.env.UXSTUDIO_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "uxs-test-b-"));
process.env.UXSTUDIO_REPLAY = "1";
process.env.UXSTUDIO_REPLAY_SPEED = "0";

const load = (agent: string) => JSON.parse(fs.readFileSync(`fixtures/replay/${agent}/medication-reminders.json`, "utf8")).output;
const arch = ArchitectureSchema.parse(load("architect"));
const content = ContentSchema.parse(load("content"));
const wires = WireframesSchema.parse(load("wireframer"));

test("mermaid check accepts valid flowcharts and rejects broken ones", async () => {
  assert.equal((await checkMermaid("flowchart TD\n A[Start] --> B{Ok?}\n B -->|yes| C[Done]")).ok, true);
  assert.equal((await checkMermaid("flowchart TD\n A[Start --> B")).ok, false);
  assert.equal((await checkMermaid("sequenceDiagram\n A->>B: hi")).ok, false);
});

test("recorded architecture, content and wireframes pass their done-checks", async () => {
  assert.equal((await architectureDod(arch)).passed, true);
  assert.equal(contentDod(content, arch).passed, true);
  assert.equal(wireframesDod(wires, arch, content, ["ios", "android"]).passed, true);
});

test("architecture: a P0 screen without an error state fails", async () => {
  const a = structuredClone(arch);
  a.screens[0].states = a.screens[0].states.filter((s) => s.state !== "error");
  const dod = await architectureDod(a);
  assert.equal(dod.checks.find((c) => c.id === "p0-states")?.passed, false);
});

test("architecture: a broken flow diagram fails", async () => {
  const a = structuredClone(arch);
  a.flows[0].mermaid = "flowchart TD\n A[Start --> B";
  assert.equal((await architectureDod(a)).checks.find((c) => c.id === "mermaid")?.passed, false);
});

test("content: vague button labels fail", () => {
  const c = structuredClone(content);
  c.screens[0].strings.find((s) => s.kind === "button")!.text = "Submit";
  assert.equal(contentDod(c, arch).checks.find((x) => x.id === "button-labels")?.passed, false);
});

test("wireframes: two primary buttons in one state fail", () => {
  const w = structuredClone(wires);
  const blocks = w.screens[0].states[0].blocks;
  blocks.push({ ...blocks.find((b) => b.variant === "primary")! });
  assert.equal(wireframesDod(w, arch, content, ["ios"]).checks.find((x) => x.id === "one-primary")?.passed, false);
});

test("wireframes: unknown copy keys fail", () => {
  const w = structuredClone(wires);
  w.screens[0].states[0].blocks[0].copy = "today.does-not-exist";
  assert.equal(wireframesDod(w, arch, content, ["ios"]).checks.find((x) => x.id === "copy-keys")?.passed, false);
});

test("unattended run takes the sample brief through all four stages", async () => {
  const sample = (await getSample("medication-reminders"))!;
  const p = await createProject({ name: "B", brief: sample.brief, platforms: sample.platforms, sampleId: sample.id, mode: "unattended" });
  const id = await startRun(p.slug);
  // Generous limit: the first Mermaid import is slow on a cold start.
  for (let i = 0; i < 2400 && getRun(id)!.status === "running"; i++) await new Promise((r) => setTimeout(r, 25));
  assert.equal(getRun(id)!.status, "done", getRun(id)!.error ?? "");
  const states = await stageStates(p.slug);
  for (const s of ["research", "architecture", "content", "wireframes"]) {
    assert.equal(states.find((x) => x.stage === s)?.status, "approved", s);
  }
});
