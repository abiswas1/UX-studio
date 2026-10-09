import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DesignSystemSchema } from "../agents/design-system/schema";
import { designSystemDod, contrastReport } from "../agents/design-system";
import { UISchema } from "../agents/ui/schema";
import { uiDod } from "../agents/ui";
import { ArchitectureSchema } from "../agents/architect/schema";
import { ContentSchema } from "../agents/content/schema";
import { WireframesSchema } from "../agents/wireframer/schema";
import { contrast } from "../lib/a11y";
import { figmaFileKey } from "../lib/figma/url";
import { uiExportJobs, wireframeExportJobs } from "../lib/figma/export";
import { copyLookup } from "../lib/copy";

const load = (agent: string) => JSON.parse(fs.readFileSync(`fixtures/replay/${agent}/medication-reminders.json`, "utf8")).output;
const ds = DesignSystemSchema.parse(load("design-system"));
const ui = UISchema.parse(load("ui"));
const arch = ArchitectureSchema.parse(load("architect"));
const content = ContentSchema.parse(load("content"));
const wires = WireframesSchema.parse(load("wireframer"));
const deps = { arch, content, wireframes: wires, platforms: ["ios", "android"] };
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

test("contrast matches known WCAG values", () => {
  assert.equal(contrast("#000000", "#FFFFFF"), 21);
  assert.equal(contrast("#FFFFFF", "#FFFFFF"), 1);
  // Apple's secondaryLabel (60% #3C3C43) on the grouped background falls short of 4.5:1.
  assert.ok(contrast("#3C3C4399", "#F2F2F7") < 4.5);
});

test("recorded design system and UI pass their done-checks", () => {
  assert.equal(designSystemDod(ds, ["ios", "android"], wires).passed, true, JSON.stringify(designSystemDod(ds, ["ios", "android"], wires).checks.filter((c) => !c.passed)));
  assert.equal(uiDod(ui, deps).passed, true, JSON.stringify(uiDod(ui, deps).checks.filter((c) => !c.passed)));
});

test("design system: Apple's default secondary text colour fails contrast", () => {
  const d = structuredClone(ds);
  d.themes[0].color.light.textMuted = "#3C3C4399";
  const report = contrastReport(d).filter((r) => !r.passed);
  assert.ok(report.some((r) => r.fg === "textMuted"));
  assert.equal(designSystemDod(d, ["ios", "android"], wires).checks.find((c) => c.id === "contrast")?.passed, false);
});

test("design system: a missing platform theme and small targets fail", () => {
  const d = structuredClone(ds);
  d.themes = d.themes.filter((t) => t.platform === "ios");
  d.themes[0].minTarget = 32;
  const dod = designSystemDod(d, ["ios", "android"], wires);
  assert.equal(dod.checks.find((c) => c.id === "themes")?.passed, false);
  assert.equal(dod.checks.find((c) => c.id === "targets")?.passed, false);
});

test("UI: a sheet shown full screen, and missing component states, fail", () => {
  const u = structuredClone(ui);
  u.screens.find((s) => s.screenId === "dose-reminder")!.presentation = "full";
  u.componentStates = u.componentStates.filter((c) => c.component !== "button/primary");
  const dod = uiDod(u, deps);
  assert.equal(dod.checks.find((c) => c.id === "presentation")?.passed, false);
  assert.equal(dod.checks.find((c) => c.id === "states")?.passed, false);
});

test("Figma URLs give their file key", () => {
  assert.equal(figmaFileKey("https://www.figma.com/design/2p2wcD2i751EzR4dxG4auF/Untitled?node-id=0-1"), "2p2wcD2i751EzR4dxG4auF");
  assert.equal(figmaFileKey("https://www.figma.com/design/AAAAAAAAAAAAAAAAAAAAAA/branch/BBBBBBBBBBBBBBBBBBBBBB/Name"), "BBBBBBBBBBBBBBBBBBBBBB");
  assert.equal(figmaFileKey("https://example.com"), "");
});

test("Figma export scripts are valid JavaScript and stay under the 50k limit", () => {
  const jobs = [
    ...uiExportJobs(ui, ds, copyLookup(content), { platforms: ["ios", "android"], mode: "light", projectName: "Dose" }),
    ...uiExportJobs(ui, ds, copyLookup(content), { platforms: ["android"], mode: "dark", projectName: "Dose" }),
    ...wireframeExportJobs(wires, copyLookup(content), { platform: "ios", projectName: "Dose" }),
  ];
  assert.equal(jobs.length, ui.screens.length * 3 + wires.screens.length);
  for (const j of jobs) {
    assert.doesNotThrow(() => new AsyncFunction(j.code), j.label);
    assert.ok(j.code.length < 50000, `${j.label} is ${j.code.length} characters`);
    assert.ok(!j.code.includes("⟨"), "unresolved copy keys");
  }
  // Android binds Material 3 variables and buttons; iOS draws from tokens.
  const android = jobs.find((j) => j.platform === "android")!.code;
  assert.match(android, /"Teal LT"/);
  assert.match(android, /"buttonSets":\{"primary":"ab924dce/);
  const ios = jobs.find((j) => j.platform === "ios")!.code;
  assert.match(ios, /"buttonSets":\{\}/);
});
