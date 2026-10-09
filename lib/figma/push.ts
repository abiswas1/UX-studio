// "Push to Figma": sends wireframes or UI to the designer's Figma file as editable frames, and
// task flows to FigJam. The frame scripts are generated deterministically (lib/figma/export.ts);
// a small agent runs them through the Figma MCP server configured in the user's Claude Code
// settings and reports what was created.
import path from "node:path";
import { z } from "zod";
import { getProject, logDecision } from "../storage/projects";
import { getApproved, getLatest, getVersion } from "../storage/artifacts";
import { projectDir } from "../storage/paths";
import { readJson, writeJson } from "../storage/fs";
import { emit } from "../runtime/events";
import { isReplayMode, modelFor } from "../runtime/models";
import { sdkProvider } from "../runtime/sdk-provider";
import { figmaFileKey, figmaNodeUrl } from "./url";
import { uiExportJobs, wireframeExportJobs, type ExportJob } from "./export";
import { toFigjamMermaid } from "./figjam";
import { copyLookup } from "../copy";
import type { UI } from "../../agents/ui/schema";
import type { Wireframes } from "../../agents/wireframer/schema";
import type { DesignSystem } from "../../agents/design-system/schema";
import type { Content } from "../../agents/content/schema";
import type { Architecture } from "../../agents/architect/schema";

export type PushStage = "ui" | "wireframes" | "architecture";

export interface PushRecord {
  stage: PushStage;
  version: number;
  fileKey: string;
  at: string;
  items: { label: string; url: string }[];
  errors: string[];
}

const stateFile = (slug: string) => path.join(projectDir(slug), "state", "figma.json");

export async function listPushes(slug: string): Promise<PushRecord[]> {
  return (await readJson<PushRecord[]>(stateFile(slug))) ?? [];
}

const PushResult = z.object({
  frames: z.array(z.object({ label: z.string(), sectionId: z.string() })).describe("One entry per script that ran, with the sectionId it returned"),
  diagrams: z.array(z.object({ label: z.string(), url: z.string() })).describe("FigJam diagrams created, with their URLs"),
  errors: z.array(z.string()).describe("Scripts or diagrams that failed, with the error"),
});

const SYSTEM = `You publish design work to Figma for a designer. You will be given Figma Plugin API scripts and Mermaid flowcharts.
For each script, call the Figma use_figma tool with the given fileKey and the script exactly as given — do not edit, shorten or reformat it.
For each flowchart, call generate_diagram with the Mermaid source and the given name; add the second and later flowcharts to the FigJam file the first one created (pass its fileKey).
Then call submit_artifact with the sectionId returned by each script, the URL of each diagram, and any errors. Do nothing else.`;

/** Build the export jobs for a stage's approved (or latest) version. */
async function jobsFor(slug: string, stage: PushStage, projectName: string, platforms: string[]) {
  const pick = async <T,>(s: "ui" | "wireframes" | "architecture" | "design-system" | "content", v?: number) =>
    v ? getVersion<T>(slug, s, v) : (await getApproved<T>(slug, s)) ?? (await getLatest<T>(slug, s));
  if (stage === "architecture") {
    const a = await pick<Architecture>("architecture");
    if (!a) throw new Error("No architecture yet.");
    return { version: a.meta.version, jobs: [] as ExportJob[], flows: a.data.flows.map((f) => ({ name: `${projectName} — ${f.id}. ${f.name}`, mermaid: toFigjamMermaid(f.mermaid) })) };
  }
  if (stage === "wireframes") {
    const w = await pick<Wireframes>("wireframes");
    if (!w) throw new Error("No wireframes yet.");
    const content = await pick<Content>("content", Number(w.meta.inputs.content) || undefined);
    const platform = platforms.includes("ios") ? "ios" : platforms.includes("android") ? "android" : "web";
    return { version: w.meta.version, jobs: wireframeExportJobs(w.data, copyLookup(content?.data), { platform, projectName }), flows: [] };
  }
  const ui = await pick<UI>("ui");
  if (!ui) throw new Error("No UI yet.");
  const ds = await pick<DesignSystem>("design-system", Number(ui.meta.inputs["design-system"]) || undefined);
  const content = await pick<Content>("content", Number(ui.meta.inputs.content) || undefined);
  if (!ds) throw new Error("The UI's design system version is missing.");
  const targets = platforms.filter((p): p is "ios" | "android" | "web" => ["ios", "android", "web"].includes(p));
  return { version: ui.meta.version, jobs: uiExportJobs(ui.data, ds.data, copyLookup(content?.data), { platforms: targets, mode: "light", projectName }), flows: [] };
}

export async function pushToFigma(slug: string, stage: PushStage): Promise<PushRecord> {
  const project = await getProject(slug);
  if (!project) throw new Error("Project not found");
  const fileKey = figmaFileKey(project.figmaFileUrl ?? "");
  if (!fileKey && stage !== "architecture") throw new Error("Add your Figma file link on the project page first.");
  if (isReplayMode()) {
    throw new Error("Pushing to Figma needs live mode: add your API key in .env and connect Figma in Claude Code (see the README).");
  }

  const { version, jobs, flows } = await jobsFor(slug, stage, project.name, project.platforms);
  const task = [
    `fileKey: ${fileKey || "(none — diagrams only)"}`,
    "",
    ...jobs.map((j, i) => `## Script ${i + 1}: ${j.label}\n\`\`\`js\n${j.code}\n\`\`\``),
    ...flows.map((f, i) => `## Flowchart ${i + 1}: ${f.name}\n\`\`\`mermaid\n${f.mermaid}\n\`\`\``),
  ].join("\n\n");

  emit(slug, { type: "tool", runId: "figma", stage, name: "figma", summary: `Pushing ${jobs.length} screen script(s) and ${flows.length} flow(s)` });
  const result = await sdkProvider.run({
    agentId: "figma-export",
    model: modelFor("figma-export", project),
    systemPrompt: SYSTEM,
    task,
    schema: PushResult,
    tools: [],
    figmaTools: ["use_figma", "generate_diagram"],
    subagents: {},
    maxTurns: jobs.length + flows.length + 6,
    maxBudgetUsd: 2,
    cwd: projectDir(slug),
    signal: new AbortController().signal,
    onEvent: (e) => e.kind === "tool" && emit(slug, { type: "tool", runId: "figma", stage, name: e.name, summary: e.summary }),
    replayKey: { project: slug, agentId: "figma-export" },
  });
  if (result.error || !result.output) throw new Error(result.error ?? "The Figma push didn't report back.");
  const out = result.output as z.infer<typeof PushResult>;

  const record: PushRecord = {
    stage, version, fileKey, at: new Date().toISOString(),
    items: [
      ...out.frames.map((f) => ({ label: f.label, url: figmaNodeUrl(fileKey, f.sectionId) })),
      ...out.diagrams.map((d) => ({ label: d.label, url: d.url })),
    ],
    errors: out.errors,
  };
  await writeJson(stateFile(slug), [record, ...(await listPushes(slug))].slice(0, 20));
  await logDecision(slug, `Pushed ${stage} v${version} to Figma`, `${record.items.length} item(s)${record.errors.length ? `, ${record.errors.length} error(s)` : ""}.`);
  emit(slug, { type: "changed" });
  return record;
}
