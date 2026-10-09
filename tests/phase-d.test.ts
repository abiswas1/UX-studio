import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CritiqueSchema } from "../agents/critic/schema";
import { critiqueDod, seriousFindings } from "../agents/critic";
import { automatedFindings } from "../agents/critic/automated";
import { PrototypeSchema } from "../agents/prototyper/schema";
import { prototypeDod } from "../agents/prototyper";
import { UISchema } from "../agents/ui/schema";
import { DesignSystemSchema } from "../agents/design-system/schema";
import { ArchitectureSchema } from "../agents/architect/schema";
import { ContentSchema } from "../agents/content/schema";
import { buildPrototypeHtml } from "../lib/prototype/build";
import { createProject } from "../lib/storage/projects";
import { startRun } from "../lib/orchestrator/orchestrator";
import { getRun } from "../lib/storage/db";
import { listVersions } from "../lib/storage/artifacts";
import { projectDir } from "../lib/storage/paths";
import { getSample } from "../lib/samples";

// Settings are read lazily, so setting them after the imports is fine.
process.env.UXSTUDIO_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "uxs-test-d-"));
process.env.UXSTUDIO_REPLAY = "1";
process.env.UXSTUDIO_REPLAY_SPEED = "0";

const load = (agent: string, round = "") => JSON.parse(fs.readFileSync(`fixtures/replay/${agent}/medication-reminders${round}.json`, "utf8")).output;
const ui0 = UISchema.parse(load("ui"));
const ui1 = UISchema.parse(load("ui", ".r1"));
const ds = DesignSystemSchema.parse(load("design-system"));
const arch = ArchitectureSchema.parse(load("architect"));
const content1 = ContentSchema.parse(load("content", ".r1"));
const crit0 = CritiqueSchema.parse(load("critic"));
const crit1 = CritiqueSchema.parse(load("critic", ".r1"));
const proto = PrototypeSchema.parse(load("prototyper"));

test("automated checks find the unannounced History loading state, and the fix removes it", () => {
  const before = automatedFindings(ui0, ds);
  assert.deepEqual(before.map((f) => f.wcag), ["4.1.3 Status Messages"]);
  assert.equal(automatedFindings(ui1, ds).length, 0);
});

test("recorded critiques pass their done-checks; round 1 resolves the serious findings", () => {
  assert.equal(critiqueDod(crit0, { ui: ui0, automatedIds: ["A1"] }).passed, true);
  assert.equal(critiqueDod(crit1, { ui: ui1, automatedIds: [] }).passed, true);
  assert.equal(seriousFindings(crit0).length, 4);
  assert.equal(seriousFindings(crit1).length, 0);
});

test("critique: dropping an automated result or a heuristic fails", () => {
  const c = structuredClone(crit0);
  c.findings = c.findings.filter((f) => f.id !== "A1");
  c.heuristicsReviewed = c.heuristicsReviewed.slice(1);
  const dod = critiqueDod(c, { ui: ui0, automatedIds: ["A1"] });
  assert.equal(dod.checks.find((x) => x.id === "automated")?.passed, false);
  assert.equal(dod.checks.find((x) => x.id === "heuristics")?.passed, false);
});

test("recorded prototype passes its done-checks", () => {
  const dod = prototypeDod(proto, { ui: ui1, arch, critique: crit1 });
  assert.equal(dod.passed, true, JSON.stringify(dod.checks.filter((c) => !c.passed)));
});

test("prototype: dead links, unreachable P0 screens and unlisted serious issues fail", () => {
  const p = structuredClone(proto);
  p.links = p.links.filter((l) => l.to.screenId !== "history");
  p.links.push({ from: { screenId: "today", state: "default" }, element: "today.nope", to: { screenId: "nowhere", state: "default" }, trigger: "tap", note: "" });
  const dod = prototypeDod(p, { ui: ui1, arch, critique: crit0 });
  for (const id of ["link-targets", "link-elements", "reachable", "open-issues"]) assert.equal(dod.checks.find((c) => c.id === id)?.passed, false, id);
});

test("the prototype HTML contains every screen state, per platform and mode", async () => {
  const html = await buildPrototypeHtml({ title: "Dose", proto, ui: ui1, ds, content: content1, platforms: ["ios", "android"] });
  const states = ui1.screens.reduce((n, s) => n + s.states.length, 0);
  assert.equal((html.match(/<template id=/g) ?? []).length, states * 2 * 2);
  assert.match(html, /data-copy="today.undo-button"/);
  assert.ok(!html.includes("⟨"), "unresolved copy keys");
});

test("unattended run: critique sends serious issues back once, then the prototype is built", async () => {
  const sample = (await getSample("medication-reminders"))!;
  const p = await createProject({ name: "D", brief: sample.brief, platforms: sample.platforms, sampleId: sample.id, mode: "unattended" });
  const id = await startRun(p.slug);
  for (let i = 0; i < 2400 && getRun(id)!.status === "running"; i++) await new Promise((r) => setTimeout(r, 25));
  assert.equal(getRun(id)!.status, "done", getRun(id)!.error ?? "");
  assert.equal((await listVersions(p.slug, "critique")).length, 2);
  assert.equal((await listVersions(p.slug, "ui")).length, 2);
  assert.equal((await listVersions(p.slug, "research")).length, 1);
  assert.ok(fs.existsSync(path.join(projectDir(p.slug), "exports", "prototype", "index.html")));
  assert.ok(fs.existsSync(path.join(projectDir(p.slug), "exports", "handoff.md")));
});
