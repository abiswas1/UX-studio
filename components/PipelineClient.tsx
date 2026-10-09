"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useHotkeys } from "./useHotkeys";
import { StatusChip } from "./StatusChip";
import { FigmaFileCard } from "./FigmaControls";
import type { StageStatus } from "@/lib/orchestrator/status";
import type { Assumption, OpenQuestion, Project } from "@/lib/storage/projects";
import type { DodResult } from "@/lib/storage/artifacts";

interface StageRow {
  id: string; order: number; title: string; summary: string; status: StageStatus;
  latest: number | null; approved: number | null; staleBecause: string[];
  dod: DodResult | null; author: string | null; replay: boolean; model: string;
}
interface RunRow { id: string; status: string; stage: string | null; error: string | null; cost: number; budget: number | null; startedAt: string; replay: boolean }

interface Props {
  project: Project;
  brief: string;
  uploads: { name: string; bytes: number }[];
  stages: StageRow[];
  runs: RunRow[];
  activeRunId: string | null;
  totalCost: number;
  assumptions: Assumption[];
  questions: OpenQuestion[];
  decisions: string[];
}

type LogLine = { kind: "text" | "tool" | "status"; text: string };

const money = (n: number) => `$${n.toFixed(2)}`;
const RUN_LABEL: Record<string, string> = {
  running: "Running", waiting_approval: "Waiting for your review", done: "Finished", failed: "Failed", stopped: "Stopped",
};

async function post(url: string, body?: unknown, method = "POST") {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json;
}

export function PipelineClient(props: Props) {
  const { project, stages, runs, activeRunId } = props;
  const router = useRouter();
  const base = `/api/projects/${project.slug}`;
  const firstActionable = Math.max(0, stages.findIndex((s) => s.status !== "approved" && s.status !== "coming_soon"));
  const [sel, setSel] = useState(firstActionable);
  const [log, setLog] = useState<LogLine[]>([]);
  const [liveCost, setLiveCost] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingBrief, setEditingBrief] = useState(false);
  const [briefDraft, setBriefDraft] = useState(props.brief);
  const logRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const activeRun = runs.find((r) => r.id === activeRunId) ?? null;
  const lastRun = runs[0] ?? null;
  const running = activeRun?.status === "running";
  const selected = stages[sel];

  // Live updates from the server.
  useEffect(() => {
    const es = new EventSource(`${base}/events`);
    es.onmessage = (m) => {
      const e = JSON.parse(m.data);
      if (e.type === "text") {
        setLog((l) => {
          const last = l[l.length - 1];
          if (last?.kind === "text") return [...l.slice(0, -1), { kind: "text", text: last.text + e.text }];
          return [...l, { kind: "text", text: e.text }];
        });
      } else if (e.type === "tool") {
        setLog((l) => [...l, { kind: "tool", text: `→ ${e.name}${e.summary ? `  ${e.summary}` : ""}` }]);
      } else if (e.type === "cost") {
        setLiveCost(e.costUsd);
      } else if (e.type === "stage") {
        if (["retrying", "revising"].includes(e.status)) setLog((l) => [...l, { kind: "status", text: `${e.status === "retrying" ? "Retrying" : "Revising to pass the done-checks"}: ${e.detail ?? ""}` }]);
        if (e.status === "running") setLog((l) => [...l, { kind: "status", text: `Started ${e.stage}` }]);
        router.refresh();
      } else {
        router.refresh();
      }
    };
    return () => es.close();
  }, [base, router]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  // Follow the run: select the stage that is running or waiting for review.
  const followStage = activeRun?.stage ?? null;
  useEffect(() => {
    const i = followStage ? stages.findIndex((s) => s.id === followStage) : -1;
    if (i >= 0) setSel(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followStage]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runPipeline = () => act(async () => { setLog([]); setLiveCost(null); await post(`${base}/runs`, {}); });
  const runStage = (s: StageRow) => act(async () => { setLog([]); setLiveCost(null); await post(`${base}/runs`, { stages: [s.id] }); });
  const stop = () => activeRun && act(() => post(`${base}/runs/${activeRun.id}`, undefined, "DELETE"));
  const approve = (s: StageRow, override = false) => s.latest && act(() => post(`${base}/stages/${s.id}/approve`, { version: s.latest, override }));
  const setMode = (mode: string) => act(() => post(base, { mode }, "PATCH"));
  const saveBrief = () => act(async () => { await post(base, { brief: briefDraft }, "PATCH"); setEditingBrief(false); });
  const upload = (files: FileList | null) => {
    if (!files?.length) return;
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);
    act(async () => {
      const res = await fetch(`${base}/uploads`, { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed");
    });
  };

  const canRun = (s: StageRow) => s.status !== "coming_soon" && s.status !== "blocked" && !running;
  const canApprove = (s: StageRow) => !!s.latest && (s.status === "needs_review" || s.status === "checks_failed");

  useHotkeys({
    j: () => setSel((i) => Math.min(stages.length - 1, i + 1)),
    k: () => setSel((i) => Math.max(0, i - 1)),
    Enter: () => selected?.latest && router.push(`/p/${project.slug}/${selected.id}`),
    r: () => selected && canRun(selected) && runStage(selected),
    a: () => selected && canApprove(selected) && selected.dod?.passed && approve(selected),
    x: () => router.push(`/p/${project.slug}/report`),
  });

  const cost = running && liveCost !== null ? liveCost : activeRun?.cost ?? lastRun?.cost ?? 0;
  const budget = activeRun?.budget ?? lastRun?.budget ?? null;

  return (
    <main className="page">
      <div className="row" style={{ marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 style={{ margin: 0 }}>{project.name}</h1>
          <div className="faint">{project.platforms.map((p) => ({ web: "Web", ios: "iOS", android: "Android" })[p]).join(" · ")}</div>
        </div>
        {stages.some((s) => s.latest) && <Link className="btn" href={`/p/${project.slug}/report`}>Export <kbd>x</kbd></Link>}
        <label className="sr-only" htmlFor="mode">Run mode</label>
        <select id="mode" value={project.mode} onChange={(e) => setMode(e.target.value)} style={{ width: "auto" }} disabled={busy}>
          <option value="approve">Stop for review after each stage</option>
          <option value="unattended">Run on its own</option>
        </select>
        {running ? (
          <button className="danger" onClick={stop} disabled={busy}>Stop run</button>
        ) : (
          <button className="primary" onClick={runPipeline} disabled={busy}>Run pipeline</button>
        )}
      </div>

      {error && <div className="notice bad" role="alert" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="grid-2">
        <div className="stack">
          {/* Run status and cost meter */}
          {(activeRun || lastRun) && (
            <div className="card">
              <div className="row">
                <strong>{RUN_LABEL[(activeRun ?? lastRun)!.status] ?? (activeRun ?? lastRun)!.status}</strong>
                {(activeRun ?? lastRun)!.replay && <span className="badge replay">Sample output</span>}
                <span style={{ flex: 1 }} />
                <span className="mono" title="Cost of this run so far">
                  {money(cost)}{budget ? <span className="faint"> of {money(budget)} cap</span> : null}
                </span>
                <span className="faint">· project total {money(Math.max(props.totalCost, cost))}</span>
              </div>
              {budget ? (
                <div aria-hidden style={{ height: 4, background: "var(--surface-2)", borderRadius: 2, marginTop: 8 }}>
                  <div style={{ width: `${Math.min(100, (cost / budget) * 100)}%`, height: 4, background: "var(--accent)", borderRadius: 2 }} />
                </div>
              ) : null}
              {activeRun?.status === "waiting_approval" && (() => {
                const waiting = stages.find((s) => s.id === activeRun.stage);
                if (!waiting) return null;
                return (
                  <div className="row" style={{ marginTop: 8 }}>
                    <p className="muted" style={{ margin: 0, flex: 1 }}>Review the {waiting.title} stage and approve it to continue.</p>
                    {waiting.latest && <Link className="btn small" href={`/p/${project.slug}/${waiting.id}`}>Review {waiting.title}</Link>}
                  </div>
                );
              })()}
              {lastRun?.error && !activeRun && <div className="notice bad" style={{ marginTop: 8 }}>{lastRun.error}</div>}
              {(running || log.length > 0) && (
                <details open={running} style={{ marginTop: 10 }}>
                  <summary className="faint" style={{ cursor: "pointer" }}>Agent activity</summary>
                  <div className="live" ref={logRef} aria-live="polite" style={{ marginTop: 6 }}>
                    {log.length ? log.map((l, i) => <div key={i} className={l.kind === "tool" ? "tool" : ""}>{l.text}</div>) : "Starting…"}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* Selected stage */}
          {selected && (
            <div className="card stack" aria-label={`${selected.title} details`}>
              <div className="row">
                <h2 style={{ margin: 0 }}>{selected.title}</h2>
                <StatusChip status={selected.status} />
                <span style={{ flex: 1 }} />
                {selected.status !== "coming_soon" && <span className="faint">Model: {selected.model}</span>}
              </div>
              {selected.status === "coming_soon" && <p className="muted">This specialist arrives in a later build phase.</p>}
              {selected.status === "blocked" && <p className="muted">Approve the earlier stages first.</p>}
              {selected.status === "stale" && (
                <div className="notice warn">
                  Out of date: {selected.staleBecause.map((s) => (s === "brief" ? "the brief or uploads" : s)).join(", ")} changed since this was made. Run it again, or edit it to confirm it still holds.
                </div>
              )}
              {selected.latest && (
                <p style={{ margin: 0 }}>
                  Latest: version {selected.latest}
                  {selected.author === "me" ? " (your edit)" : ""}
                  {selected.approved ? ` · approved: version ${selected.approved}` : " · not approved yet"}
                  {selected.replay ? " · sample output" : ""}
                </p>
              )}
              {selected.dod && (
                <div>
                  <h3>Done-checks</h3>
                  <ul className="dod">
                    {selected.dod.checks.map((c) => (
                      <li key={c.id}>
                        <span className={c.passed ? "ok" : "no"} aria-label={c.passed ? "Passed" : "Failed"}>{c.passed ? "✓" : "✗"}</span>
                        <span>{c.label}{c.detail ? <span className="faint"> — {c.detail}</span> : null}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="row">
                {selected.latest && <Link className="btn" href={`/p/${project.slug}/${selected.id}`}>Open <kbd>Enter</kbd></Link>}
                {canApprove(selected) && selected.dod?.passed && (
                  <button className="primary" onClick={() => approve(selected)} disabled={busy}>Approve version {selected.latest} <kbd>a</kbd></button>
                )}
                {canApprove(selected) && !selected.dod?.passed && (
                  <button onClick={() => confirm("Approve even though some done-checks failed? This is recorded in the decision log.") && approve(selected, true)} disabled={busy}>
                    Approve anyway
                  </button>
                )}
                {canRun(selected) && (
                  <button onClick={() => runStage(selected)} disabled={busy}>{selected.latest ? "Run again" : "Run this stage"} <kbd>r</kbd></button>
                )}
              </div>
            </div>
          )}
          {/* Stages */}
          <ol className="stages" aria-label="Pipeline stages">
            {stages.map((s, i) => (
              <li
                key={s.id}
                className={`stage${i === sel ? " selected" : ""}${s.status === "coming_soon" ? " disabled" : ""}`}
                onClick={() => setSel(i)}
                onDoubleClick={() => s.latest && router.push(`/p/${project.slug}/${s.id}`)}
                aria-current={i === sel}
              >
                <span className="num">{s.order}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="title">{s.title}</div>
                  <div className="sub">{s.summary}</div>
                </div>
                <StatusChip status={s.status} />
              </li>
            ))}
          </ol>

        </div>

        <aside className="stack">
          <div className="card">
            <div className="row" style={{ marginBottom: 6 }}>
              <h3 style={{ margin: 0, flex: 1 }}>Brief</h3>
              {!editingBrief && <button className="small ghost" onClick={() => { setBriefDraft(props.brief); setEditingBrief(true); }}>Edit</button>}
            </div>
            {editingBrief ? (
              <div className="stack">
                <label className="sr-only" htmlFor="brief-edit">Brief</label>
                <textarea id="brief-edit" rows={12} value={briefDraft} onChange={(e) => setBriefDraft(e.target.value)} autoFocus />
                <p className="faint" style={{ margin: 0 }}>Changing the brief marks research (and everything after it) as out of date.</p>
                <div className="row">
                  <button className="primary small" onClick={saveBrief} disabled={busy}>Save brief</button>
                  <button className="small ghost" onClick={() => setEditingBrief(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="muted" style={{ whiteSpace: "pre-wrap", fontSize: 14, maxHeight: 220, overflow: "auto" }}>{props.brief}</div>
            )}
          </div>

          <div className="card">
            <div className="row" style={{ marginBottom: 6 }}>
              <h3 style={{ margin: 0, flex: 1 }}>Research files</h3>
              <button className="small ghost" onClick={() => fileRef.current?.click()} disabled={busy}>Add files</button>
              <input ref={fileRef} type="file" multiple hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.csv,.txt,.md,.vtt,.srt,.docx,.json" onChange={(e) => upload(e.target.files)} />
            </div>
            {props.uploads.length ? (
              <ul style={{ margin: 0, fontSize: 14 }}>
                {props.uploads.map((u) => <li key={u.name}>{u.name} <span className="faint">{Math.ceil(u.bytes / 1024)} KB</span></li>)}
              </ul>
            ) : (
              <p className="faint" style={{ margin: 0 }}>None yet. Interview notes, survey results, analytics exports or screenshots help the Researcher work from evidence instead of assumptions.</p>
            )}
          </div>

          <FigmaFileCard slug={project.slug} url={project.figmaFileUrl} />

          <div className="card">
            <h3>Assumptions <span className="faint">({props.assumptions.length})</span></h3>
            {props.assumptions.length ? (
              <ul style={{ margin: 0, fontSize: 14 }}>{props.assumptions.map((a) => <li key={a.id}>{a.text}</li>)}</ul>
            ) : <p className="faint" style={{ margin: 0 }}>None recorded yet.</p>}
          </div>

          <div className="card">
            <h3>Open questions <span className="faint">({props.questions.length})</span></h3>
            {props.questions.length ? (
              <ul style={{ margin: 0, fontSize: 14 }}>{props.questions.map((q) => <li key={q.id}>{q.text}</li>)}</ul>
            ) : <p className="faint" style={{ margin: 0 }}>None recorded yet.</p>}
          </div>

          <div className="card">
            <h3>Decision log</h3>
            <ul style={{ margin: 0, fontSize: 13, listStyle: "none", padding: 0 }} className="muted">
              {props.decisions.map((d, i) => <li key={i} style={{ marginBottom: 4 }}>{d.replace(/^- /, "").replace(/\*\*/g, "")}</li>)}
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}
