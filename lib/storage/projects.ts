import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { projectDir, projectsDir } from "./paths";
import { readJson, readText, writeFileAtomic, writeJson } from "./fs";

export type Platform = "web" | "ios" | "android";
export type RunMode = "approve" | "unattended";

export interface Project {
  slug: string;
  name: string;
  platforms: Platform[];
  mode: RunMode;
  createdAt: string;
  updatedAt: string;
  /** Per-agent model overrides, e.g. { "researcher": "claude-opus-5-5" }. */
  models?: Record<string, string>;
  budgetUsd?: number;
  /** The designer's Figma file, read by the Design System agent and used for "Push to Figma". */
  figmaFileUrl?: string;
  /** Set when the project was created from one of the sample briefs (used by replay mode). */
  sampleId?: string;
}

export interface Assumption {
  id: string;
  text: string;
  stage: string;
  status: "open" | "validated" | "rejected";
}

export interface OpenQuestion {
  id: string;
  text: string;
  stage: string;
  status: "open" | "answered";
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "project"
  );
}

export async function listProjects(): Promise<Project[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(projectsDir());
  } catch {
    return [];
  }
  const projects = await Promise.all(entries.map((e) => readJson<Project>(path.join(projectsDir(), e, "project.json"))));
  return projects.filter((p): p is Project => !!p).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(slug: string): Promise<Project | null> {
  return readJson<Project>(path.join(projectDir(slug), "project.json"));
}

export async function createProject(input: {
  name: string;
  brief: string;
  platforms: Platform[];
  mode?: RunMode;
  sampleId?: string;
}): Promise<Project> {
  let slug = slugify(input.name);
  for (let i = 2; await getProject(slug); i++) slug = `${slugify(input.name)}-${i}`;
  const now = new Date().toISOString();
  const project: Project = {
    slug,
    name: input.name.trim(),
    platforms: input.platforms.length ? input.platforms : ["web"],
    mode: input.mode ?? "approve",
    createdAt: now,
    updatedAt: now,
    ...(input.sampleId ? { sampleId: input.sampleId } : {}),
  };
  const dir = projectDir(slug);
  await fs.mkdir(path.join(dir, "uploads"), { recursive: true });
  await fs.mkdir(path.join(dir, "stages"), { recursive: true });
  await writeJson(path.join(dir, "project.json"), project);
  await writeFileAtomic(path.join(dir, "brief.md"), input.brief.trim() + "\n");
  await writeJson(path.join(dir, "state", "assumptions.json"), []);
  await writeJson(path.join(dir, "state", "open-questions.json"), []);
  await writeFileAtomic(path.join(dir, "state", "decisions.md"), `# Decision log — ${project.name}\n\n`);
  await logDecision(slug, "Project created", `Platforms: ${project.platforms.join(", ")}. Mode: ${project.mode}.`);
  return project;
}

export async function updateProject(slug: string, patch: Partial<Omit<Project, "slug" | "createdAt">>): Promise<Project> {
  const current = await getProject(slug);
  if (!current) throw new Error(`No project ${slug}`);
  const next = { ...current, ...patch, slug, updatedAt: new Date().toISOString() };
  await writeJson(path.join(projectDir(slug), "project.json"), next);
  return next;
}

export async function touchProject(slug: string): Promise<void> {
  await updateProject(slug, {});
}

export async function getBrief(slug: string): Promise<string> {
  return (await readText(path.join(projectDir(slug), "brief.md"))) ?? "";
}

export async function setBrief(slug: string, brief: string): Promise<void> {
  await writeFileAtomic(path.join(projectDir(slug), "brief.md"), brief.trim() + "\n");
  await logDecision(slug, "Brief edited", "Stages built from the previous brief are now out of date.");
  await touchProject(slug);
}

export async function listUploads(slug: string): Promise<{ name: string; bytes: number }[]> {
  const dir = path.join(projectDir(slug), "uploads");
  try {
    const names = (await fs.readdir(dir)).filter((n) => !n.startsWith("."));
    return Promise.all(names.sort().map(async (name) => ({ name, bytes: (await fs.stat(path.join(dir, name))).size })));
  } catch {
    return [];
  }
}

export async function saveUpload(slug: string, filename: string, data: Buffer): Promise<string> {
  const safe = path.basename(filename).replace(/[^\w.\- ]+/g, "_");
  if (!safe || safe.startsWith(".")) throw new Error("Invalid file name");
  await fs.mkdir(path.join(projectDir(slug), "uploads"), { recursive: true });
  await fs.writeFile(path.join(projectDir(slug), "uploads", safe), data);
  await logDecision(slug, "File uploaded", safe);
  return safe;
}

/** Fingerprint of everything the first stage reads: the brief, platforms and uploads. */
export async function briefFingerprint(slug: string): Promise<string> {
  const [brief, uploads, project] = await Promise.all([getBrief(slug), listUploads(slug), getProject(slug)]);
  const h = crypto.createHash("sha256");
  h.update(brief);
  h.update(JSON.stringify(project?.platforms ?? []));
  for (const u of uploads) h.update(`${u.name}:${u.bytes}`);
  return h.digest("hex").slice(0, 12);
}

// ---- shared project state ----

const stateFile = (slug: string, name: string) => path.join(projectDir(slug), "state", name);

export async function getAssumptions(slug: string): Promise<Assumption[]> {
  return (await readJson<Assumption[]>(stateFile(slug, "assumptions.json"))) ?? [];
}

export async function getOpenQuestions(slug: string): Promise<OpenQuestion[]> {
  return (await readJson<OpenQuestion[]>(stateFile(slug, "open-questions.json"))) ?? [];
}

/** Replace a stage's assumptions/questions with the latest ones it produced, keeping other stages' entries. */
export async function replaceStageState(
  slug: string,
  stage: string,
  assumptions: string[],
  questions: string[],
): Promise<void> {
  const keepA = (await getAssumptions(slug)).filter((a) => a.stage !== stage);
  const keepQ = (await getOpenQuestions(slug)).filter((q) => q.stage !== stage);
  await writeJson(stateFile(slug, "assumptions.json"), [
    ...keepA,
    ...assumptions.map((text, i) => ({ id: `${stage}-a${i + 1}`, text, stage, status: "open" as const })),
  ]);
  await writeJson(stateFile(slug, "open-questions.json"), [
    ...keepQ,
    ...questions.map((text, i) => ({ id: `${stage}-q${i + 1}`, text, stage, status: "open" as const })),
  ]);
}

export async function logDecision(slug: string, title: string, detail = ""): Promise<void> {
  const file = stateFile(slug, "decisions.md");
  const existing = (await readText(file)) ?? "# Decision log\n\n";
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
  await writeFileAtomic(file, `${existing}- **${stamp}** — ${title}${detail ? `: ${detail}` : ""}\n`);
}

export async function getDecisions(slug: string): Promise<string> {
  return (await readText(stateFile(slug, "decisions.md"))) ?? "";
}
