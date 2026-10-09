import fs from "node:fs/promises";
import path from "node:path";
import type { AgentModule } from "./types";
import type { StageId } from "../stages";
import { researcher } from "../../agents/researcher";

const AGENTS: Partial<Record<StageId, AgentModule<any>>> = {
  research: researcher,
};

export function agentForStage(stage: StageId): AgentModule | undefined {
  return AGENTS[stage];
}

export interface AgentPrompt {
  body: string;
  maxTurns: number;
  raw: string;
}

/** Load an agent's editable system prompt from agents/<id>/prompt.md (front matter stripped). */
export async function loadPrompt(agentId: string): Promise<AgentPrompt> {
  const raw = await fs.readFile(path.join(process.cwd(), "agents", agentId, "prompt.md"), "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const front = match?.[1] ?? "";
  const maxTurns = Number(front.match(/^maxTurns:\s*(\d+)/m)?.[1] ?? 30);
  return { body: raw.slice(match?.[0].length ?? 0).trim(), maxTurns, raw };
}

export async function savePrompt(agentId: string, raw: string): Promise<void> {
  if (!/^[a-z-]+$/.test(agentId)) throw new Error("Invalid agent id");
  await fs.writeFile(path.join(process.cwd(), "agents", agentId, "prompt.md"), raw, "utf8");
}
