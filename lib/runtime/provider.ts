import type { z } from "zod";
import type { SubagentDef } from "../agents/types";

export type ProviderEvent =
  | { kind: "text"; text: string }
  | { kind: "tool"; name: string; summary: string };

export interface ProviderRequest {
  agentId: string;
  model: string;
  systemPrompt: string;
  task: string;
  schema: z.ZodType;
  tools: string[];
  subagents: Record<string, SubagentDef>;
  maxTurns: number;
  maxBudgetUsd: number;
  cwd: string;
  signal: AbortSignal;
  onEvent: (e: ProviderEvent) => void;
  /** Used by replay mode to find recorded output. */
  replayKey: { project: string; agentId: string };
}

export interface ProviderResult {
  output: unknown | null;
  error?: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  durationMs: number;
  model: string;
  replay: boolean;
}

export interface Provider {
  run(req: ProviderRequest): Promise<ProviderResult>;
}

/** Errors worth retrying: rate limits, overload, network hiccups. */
export function isTransient(message: string): boolean {
  return /\b(429|500|502|503|504|529)\b|overloaded|rate.?limit|ECONNRESET|ETIMEDOUT|socket hang up|network/i.test(message);
}
