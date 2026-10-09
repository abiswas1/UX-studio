// Settings for the agents: each one's instructions (agents/<id>/prompt.md) and which model it
// uses (config/models.json). Every saved prompt keeps the previous text in
// <UXSTUDIO_HOME>/prompt-history/<agent>/ so a change can be undone.
import fs from "node:fs/promises";
import path from "node:path";
import { STAGES, isAvailable } from "../stages";
import { homeDir } from "../storage/paths";
import { writeFileAtomic, writeJson } from "../storage/fs";
import { loadModelConfig } from "../runtime/models";
import { loadPrompt, savePrompt } from "./registry";

export interface AgentSettings {
  id: string;
  title: string;
  summary: string;
  tier: string;
  raw: string;
  history: { id: string; savedAt: string; bytes: number }[];
}

const historyDir = (agent: string) => path.join(homeDir(), "prompt-history", agent);

function assertAgent(agent: string) {
  if (!STAGES.some((s) => s.agent === agent)) throw new Error(`Unknown agent "${agent}"`);
}

export async function listPromptHistory(agent: string): Promise<AgentSettings["history"]> {
  const dir = historyDir(agent);
  const files = (await fs.readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(".md")).sort().reverse();
  return Promise.all(
    files.slice(0, 20).map(async (f) => {
      const st = await fs.stat(path.join(dir, f));
      return { id: f.replace(/\.md$/, ""), savedAt: st.mtime.toISOString(), bytes: st.size };
    }),
  );
}

export async function listAgentSettings(): Promise<AgentSettings[]> {
  const cfg = loadModelConfig();
  return Promise.all(
    STAGES.filter(isAvailable).map(async (s) => ({
      id: s.agent,
      title: s.title,
      summary: s.summary,
      tier: cfg.agents[s.agent] ?? "draft",
      raw: (await loadPrompt(s.agent)).raw,
      history: await listPromptHistory(s.agent),
    })),
  );
}

/** Save new instructions, keeping the old text in the history. */
export async function updatePrompt(agent: string, raw: string): Promise<void> {
  assertAgent(agent);
  if (!raw.trim()) throw new Error("The instructions can't be empty.");
  const before = (await loadPrompt(agent)).raw;
  if (before === raw) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 23);
  await writeFileAtomic(path.join(historyDir(agent), `${stamp}.md`), before);
  await savePrompt(agent, raw);
}

export async function readPromptHistory(agent: string, id: string): Promise<string> {
  assertAgent(agent);
  if (!/^[0-9T-]+$/.test(id)) throw new Error("Invalid history id");
  return fs.readFile(path.join(historyDir(agent), `${id}.md`), "utf8");
}

/** Change an agent's model tier, or the model id behind a tier. */
export async function updateModels(patch: { agent?: string; tier?: string; tiers?: Record<string, string>; budgetUsdPerRun?: number }): Promise<void> {
  const cfg = loadModelConfig();
  if (patch.agent) {
    assertAgent(patch.agent);
    if (!patch.tier || !(patch.tier in cfg.tiers)) throw new Error(`Unknown tier "${patch.tier}"`);
    cfg.agents[patch.agent] = patch.tier;
  }
  if (patch.tiers) {
    for (const [k, v] of Object.entries(patch.tiers)) {
      if (!(k in cfg.tiers)) throw new Error(`Unknown tier "${k}"`);
      if (!/^[a-z0-9.\-]+$/.test(v)) throw new Error(`"${v}" doesn't look like a model id`);
      cfg.tiers[k] = v;
    }
  }
  if (patch.budgetUsdPerRun !== undefined) {
    if (!(patch.budgetUsdPerRun > 0)) throw new Error("The budget must be more than $0.");
    cfg.budgetUsdPerRun = patch.budgetUsdPerRun;
  }
  await writeJson(path.join(process.cwd(), "config", "models.json"), cfg);
}
