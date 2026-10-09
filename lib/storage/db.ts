// SQLite index for runs and agent calls (cost meter, logs). Every call is also written to
// runs/<runId>/calls.jsonl inside the project, so the files on disk stay the full record.
import fs from "node:fs";
import path from "node:path";
import { homeDir } from "./paths";

type Db = import("node:sqlite").DatabaseSync;

const g = globalThis as unknown as { __uxDb?: Db };

function open(): Db {
  if (g.__uxDb) return g.__uxDb;
  // Loaded at runtime (not bundled) so it works the same under Next.js and plain Node.
  const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
  fs.mkdirSync(homeDir(), { recursive: true });
  const db = new DatabaseSync(path.join(homeDir(), "index.db"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY, project TEXT NOT NULL, mode TEXT NOT NULL, stages TEXT NOT NULL,
      status TEXT NOT NULL, current_stage TEXT, error TEXT, replay INTEGER NOT NULL DEFAULT 0,
      budget_usd REAL, cost_usd REAL NOT NULL DEFAULT 0, started_at TEXT NOT NULL, finished_at TEXT
    );
    CREATE INDEX IF NOT EXISTS runs_project ON runs(project, started_at);
    CREATE TABLE IF NOT EXISTS agent_calls (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL, project TEXT NOT NULL, stage TEXT NOT NULL,
      agent TEXT NOT NULL, model TEXT NOT NULL, attempt INTEGER NOT NULL, status TEXT NOT NULL,
      input_tokens INTEGER, output_tokens INTEGER, cache_read_tokens INTEGER, cache_write_tokens INTEGER,
      cost_usd REAL NOT NULL DEFAULT 0, duration_ms INTEGER, error TEXT, prompt_hash TEXT,
      started_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS calls_run ON agent_calls(run_id);
  `);
  g.__uxDb = db;
  return db;
}

export type RunStatus = "running" | "waiting_approval" | "done" | "failed" | "stopped";

export interface RunRow {
  id: string;
  project: string;
  mode: string;
  stages: string;
  status: RunStatus;
  current_stage: string | null;
  error: string | null;
  replay: number;
  budget_usd: number | null;
  cost_usd: number;
  started_at: string;
  finished_at: string | null;
}

export interface CallRow {
  id: string;
  run_id: string;
  project: string;
  stage: string;
  agent: string;
  model: string;
  attempt: number;
  status: "ok" | "error";
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  cost_usd: number;
  duration_ms: number | null;
  error: string | null;
  prompt_hash: string | null;
  started_at: string;
}

export function insertRun(r: Omit<RunRow, "cost_usd" | "finished_at" | "error" | "current_stage">): void {
  open()
    .prepare(
      `INSERT INTO runs (id, project, mode, stages, status, replay, budget_usd, started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(r.id, r.project, r.mode, r.stages, r.status, r.replay, r.budget_usd, r.started_at);
}

export function updateRun(id: string, patch: Partial<Pick<RunRow, "status" | "current_stage" | "error" | "finished_at">>): void {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (!keys.length) return;
  open()
    .prepare(`UPDATE runs SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
    .run(...keys.map((k) => patch[k] ?? null), id);
}

export function insertCall(c: CallRow): void {
  const db = open();
  db.prepare(
    `INSERT INTO agent_calls (id, run_id, project, stage, agent, model, attempt, status, input_tokens, output_tokens,
      cache_read_tokens, cache_write_tokens, cost_usd, duration_ms, error, prompt_hash, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    c.id, c.run_id, c.project, c.stage, c.agent, c.model, c.attempt, c.status, c.input_tokens, c.output_tokens,
    c.cache_read_tokens, c.cache_write_tokens, c.cost_usd, c.duration_ms, c.error, c.prompt_hash, c.started_at,
  );
  db.prepare(`UPDATE runs SET cost_usd = cost_usd + ? WHERE id = ?`).run(c.cost_usd, c.run_id);
}

export function getRun(id: string): RunRow | undefined {
  return open().prepare(`SELECT * FROM runs WHERE id = ?`).get(id) as RunRow | undefined;
}

export function listRuns(project: string, limit = 20): RunRow[] {
  return open().prepare(`SELECT * FROM runs WHERE project = ? ORDER BY started_at DESC LIMIT ?`).all(project, limit) as unknown as RunRow[];
}

export function listCalls(runId: string): CallRow[] {
  return open().prepare(`SELECT * FROM agent_calls WHERE run_id = ? ORDER BY started_at`).all(runId) as unknown as CallRow[];
}

export function projectCost(project: string): number {
  const row = open().prepare(`SELECT COALESCE(SUM(cost_usd), 0) AS total FROM runs WHERE project = ?`).get(project) as { total: number };
  return row.total;
}

/** Runs left "running" by a server that stopped mid-run are marked as stopped on startup. */
export function markOrphanedRuns(activeIds: Set<string>): void {
  const rows = open().prepare(`SELECT id FROM runs WHERE status = 'running'`).all() as { id: string }[];
  for (const r of rows) {
    if (!activeIds.has(r.id)) updateRun(r.id, { status: "stopped", error: "The app was closed during this run.", finished_at: new Date().toISOString() });
  }
}
