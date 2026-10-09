import fs from "node:fs/promises";
import path from "node:path";
import type { Provider, ProviderEvent, ProviderRequest, ProviderResult } from "./provider";
import { getProject } from "../storage/projects";

// Replay provider: plays back recorded output for the sample briefs, so the whole app can be
// tried without an API key or cost. Recordings live in fixtures/replay/<agent>/<sampleId>.json.

export interface Recording {
  note: string;
  model: string;
  costUsd: number;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  events: (ProviderEvent & { delayMs?: number })[];
  output: unknown;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), reject(new Error("Stopped"))), { once: true });
  });

export function replaySpeed(): number {
  return Number(process.env.UXSTUDIO_REPLAY_SPEED ?? 1);
}

export const replayProvider: Provider = {
  async run(req: ProviderRequest): Promise<ProviderResult> {
    const started = Date.now();
    const base: Omit<ProviderResult, "output" | "error"> = {
      costUsd: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
      durationMs: 0, model: req.model, replay: true,
    };
    const project = await getProject(req.replayKey.project);
    if (!project?.sampleId) {
      return { ...base, output: null, error: "Replay mode only has recorded output for the sample briefs. Add your API key in .env to run on your own brief." };
    }
    const file = path.join(process.cwd(), "fixtures", "replay", req.replayKey.agentId, `${project.sampleId}.json`);
    let rec: Recording;
    try {
      rec = JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      return { ...base, output: null, error: `No recorded output for this stage on the "${project.sampleId}" sample yet.` };
    }
    try {
      const speed = replaySpeed();
      for (const ev of rec.events) {
        if (speed > 0) await sleep((ev.delayMs ?? 40) / speed, req.signal);
        const { delayMs: _d, ...event } = ev;
        req.onEvent(event as ProviderEvent);
      }
    } catch (err) {
      return { ...base, output: null, error: (err as Error).message, durationMs: Date.now() - started };
    }
    const parsed = req.schema.safeParse(rec.output);
    if (!parsed.success) {
      return { ...base, output: null, error: `Recorded output no longer matches the schema: ${parsed.error.issues[0]?.message}` };
    }
    return {
      output: parsed.data,
      costUsd: rec.costUsd,
      inputTokens: rec.tokens.input,
      outputTokens: rec.tokens.output,
      cacheReadTokens: rec.tokens.cacheRead,
      cacheWriteTokens: rec.tokens.cacheWrite,
      durationMs: Date.now() - started,
      model: `${rec.model} (replay)`,
      replay: true,
    };
  },
};
