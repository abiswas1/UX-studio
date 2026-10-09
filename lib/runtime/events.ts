import { EventEmitter } from "node:events";

// Live events for the browser (sent over SSE). One emitter per server process,
// kept on globalThis so it survives hot reloads in development.

export type StudioEvent =
  | { type: "run"; runId: string; status: string; stage?: string; error?: string }
  | { type: "stage"; runId: string; stage: string; status: string; detail?: string }
  | { type: "text"; runId: string; stage: string; text: string }
  | { type: "tool"; runId: string; stage: string; name: string; summary: string }
  | { type: "cost"; runId: string; costUsd: number }
  | { type: "changed" };

const g = globalThis as unknown as { __uxBus?: EventEmitter };
const bus = (g.__uxBus ??= Object.assign(new EventEmitter(), {}).setMaxListeners(100));

export function emit(project: string, event: StudioEvent): void {
  bus.emit(project, event);
}

export function subscribe(project: string, fn: (e: StudioEvent) => void): () => void {
  bus.on(project, fn);
  return () => bus.off(project, fn);
}
