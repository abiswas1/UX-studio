import fs from "node:fs/promises";
import path from "node:path";
import type { Platform } from "./storage/projects";

export interface SampleBrief {
  id: string;
  name: string;
  platforms: Platform[];
  brief: string;
}

const dir = () => path.join(process.cwd(), "samples", "briefs");

export async function listSamples(): Promise<SampleBrief[]> {
  const files = (await fs.readdir(dir())).filter((f) => f.endsWith(".md")).sort();
  return Promise.all(files.map(async (f) => parseSample(await fs.readFile(path.join(dir(), f), "utf8"))));
}

export async function getSample(id: string): Promise<SampleBrief | undefined> {
  return (await listSamples()).find((s) => s.id === id);
}

function parseSample(raw: string): SampleBrief {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) throw new Error("Sample brief is missing its front matter");
  const field = (k: string) => m[1].match(new RegExp(`^${k}:\\s*(.+)$`, "m"))?.[1].trim() ?? "";
  return {
    id: field("id"),
    name: field("name"),
    platforms: field("platforms").replace(/[[\]\s]/g, "").split(",").filter(Boolean) as Platform[],
    brief: raw.slice(m[0].length).trim(),
  };
}
