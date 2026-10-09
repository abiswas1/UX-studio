import fs from "node:fs/promises";
import path from "node:path";
import { projectDir } from "./paths";
import { readJson, writeFileAtomic, writeJson } from "./fs";
import { stageById, type StageId } from "../stages";

export interface DodCheck {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
}

export interface DodResult {
  passed: boolean;
  checks: DodCheck[];
}

export interface ArtifactMeta {
  stage: StageId;
  version: number;
  author: "agent" | "me";
  createdAt: string;
  /** What this version was built from: "brief" → fingerprint, other stages → their version number. */
  inputs: Record<string, string | number>;
  dod: DodResult;
  runId?: string;
  model?: string;
  costUsd?: number;
  /** For edits: the version that was edited. */
  basedOn?: number;
  note?: string;
  /** True when produced from recorded sample output rather than a live model call. */
  replay?: boolean;
}

export interface ArtifactVersion<T = unknown> {
  meta: ArtifactMeta;
  data: T;
}

export interface StagePointer {
  latest: number;
  approved: number | null;
}

function stageDir(slug: string, stage: StageId): string {
  const def = stageById(stage);
  if (!def) throw new Error(`Unknown stage ${stage}`);
  return path.join(projectDir(slug), "stages", def.folder);
}

const vName = (n: number) => `v${String(n).padStart(4, "0")}`;

export async function getPointer(slug: string, stage: StageId): Promise<StagePointer | null> {
  return readJson<StagePointer>(path.join(stageDir(slug, stage), "current.json"));
}

export async function getVersion<T = unknown>(slug: string, stage: StageId, version: number): Promise<ArtifactVersion<T> | null> {
  return readJson<ArtifactVersion<T>>(path.join(stageDir(slug, stage), `${vName(version)}.json`));
}

export async function getLatest<T = unknown>(slug: string, stage: StageId): Promise<ArtifactVersion<T> | null> {
  const p = await getPointer(slug, stage);
  return p ? getVersion<T>(slug, stage, p.latest) : null;
}

export async function getApproved<T = unknown>(slug: string, stage: StageId): Promise<ArtifactVersion<T> | null> {
  const p = await getPointer(slug, stage);
  return p?.approved ? getVersion<T>(slug, stage, p.approved) : null;
}

export async function listVersions(slug: string, stage: StageId): Promise<ArtifactMeta[]> {
  let names: string[] = [];
  try {
    names = await fs.readdir(stageDir(slug, stage));
  } catch {
    return [];
  }
  const metas = await Promise.all(
    names
      .filter((n) => /^v\d{4}\.json$/.test(n))
      .map(async (n) => (await readJson<ArtifactVersion>(path.join(stageDir(slug, stage), n)))?.meta),
  );
  return metas.filter((m): m is ArtifactMeta => !!m).sort((a, b) => b.version - a.version);
}

/** Save a new version (full snapshot) plus its rendered markdown, and point "latest" at it. */
export async function saveVersion<T>(
  slug: string,
  stage: StageId,
  meta: Omit<ArtifactMeta, "version" | "createdAt" | "stage">,
  data: T,
  markdown: string,
): Promise<ArtifactVersion<T>> {
  const dir = stageDir(slug, stage);
  const pointer = (await getPointer(slug, stage)) ?? { latest: 0, approved: null };
  const version = pointer.latest + 1;
  const full: ArtifactVersion<T> = {
    meta: { ...meta, stage, version, createdAt: new Date().toISOString() },
    data,
  };
  await writeJson(path.join(dir, `${vName(version)}.json`), full);
  await writeFileAtomic(
    path.join(dir, `${vName(version)}.md`),
    `<!-- Generated from ${vName(version)}.json — edit in UX Studio so history is kept. -->\n\n${markdown}`,
  );
  await writeJson(path.join(dir, "current.json"), { ...pointer, latest: version });
  return full;
}

export async function setApproved(slug: string, stage: StageId, version: number | null): Promise<void> {
  const pointer = await getPointer(slug, stage);
  if (!pointer) throw new Error("Nothing to approve yet");
  await writeJson(path.join(stageDir(slug, stage), "current.json"), { ...pointer, approved: version });
}

export async function getMarkdown(slug: string, stage: StageId, version: number): Promise<string | null> {
  try {
    return await fs.readFile(path.join(stageDir(slug, stage), `${vName(version)}.md`), "utf8");
  } catch {
    return null;
  }
}
