import fs from "node:fs";
import path from "node:path";
import type { Project } from "../storage/projects";

interface ModelConfig {
  tiers: Record<string, string>;
  agents: Record<string, string>;
  budgetUsdPerRun: number;
}

export function loadModelConfig(): ModelConfig {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "config", "models.json"), "utf8"));
}

/** Model for an agent: project override → config/models.json (tier or explicit id). */
export function modelFor(agentId: string, project?: Project | null): string {
  const override = project?.models?.[agentId];
  if (override) return override;
  const cfg = loadModelConfig();
  const choice = cfg.agents[agentId] ?? "draft";
  return cfg.tiers[choice] ?? choice;
}

export function budgetFor(project?: Project | null): number {
  return project?.budgetUsd ?? loadModelConfig().budgetUsdPerRun;
}

/** Replay mode: no API key, or forced with UXSTUDIO_REPLAY=1. */
export function isReplayMode(): boolean {
  return process.env.UXSTUDIO_REPLAY === "1" || !process.env.ANTHROPIC_API_KEY;
}
