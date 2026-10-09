# UX Studio — Architecture proposal

Status: **proposed, awaiting approval**

Decisions already made:
- **Code-first UI.** Wireframes and hi-fi screens are structured JSON + React/Tailwind on disk. Figma is a one-way mirror you push to on demand.
- **Remote Figma MCP** (`mcp.figma.com`, OAuth) for reading libraries/variables and writing frames and FigJam boards.
- **Native mobile conventions.** Each project sets its platforms (`web`, `ios`, `android`). Agents apply HIG or Material patterns, and prototypes render inside device frames.

---

## 1. Agent and runtime diagram

```
┌──────────────────────── Next.js app · localhost:4747 ─────────────────────────┐
│ Projects · Pipeline · Artifact viewer/editor · History + diff · Cost · Prompts │
└───────────────┬──────────────────────────────────────────▲────────────────────┘
       REST     │                                          │  SSE (tokens, status, cost)
┌───────────────▼──────────────────────────────────────────┴────────────────────┐
│ ORCHESTRATOR (TypeScript state machine + a small LLM role)                     │
│  stage graph · run queue (survives tab close) · approval gates · DoD checks    │
│  staleness propagation · critique loop (≤2) · budget cap · brief/decision log  │
└──┬────────┬────────┬────────┬────────┬────────┬────────┬────────┬─────────────┘
   ▼        ▼        ▼        ▼        ▼        ▼        ▼        ▼
 Research  Architect Content  Wireframe DesignSys  UI      Critic   Prototyper
 ├─ competitors ─┐                       │ Figma  Designer   │ axe-core  │ esbuild
 ├─ signals/web  ├ ≤3 parallel sub-agents│ read    │          │ + vision  │ bundle
 └─ uploads     ─┘                       ▼         ▼          ▼           ▼
                                   ┌──────────── shared tools ─────────────────┐
                                   │ submit_artifact (schema-validated)        │
                                   │ read_artifact · record_assumption ·        │
                                   │ add_open_question · log_decision           │
                                   │ render_preview (Playwright screenshot)     │
                                   │ WebSearch/WebFetch · Figma MCP · uploads   │
                                   └────────────────────────────────────────────┘
        every call → Claude Agent SDK → Anthropic API (your key from .env)
```

### Stage graph and dependencies

| # | Stage | Reads (upstream) | Model tier (default) |
|---|---|---|---|
| 1 | research | brief, uploads | draft |
| 2 | architecture | research | draft |
| 3 | content | architecture, research | draft |
| 4 | wireframes | architecture, content | draft |
| 5 | design-system | brief, Figma library or tokens | strong |
| 6 | ui | wireframes, content, design-system | strong |
| 7 | critique | ui, wireframes, content | strong |
| 8 | prototype | ui, architecture (flows), critique | draft |

Stages run in this order. The design system depends only on the brief, so a research change doesn't make it stale.

### Orchestrator design
- **Control flow is deterministic code, not an LLM.** Gates, retries, staleness, and loop limits are predictable and testable. The LLM part of the orchestrator handles only the judgment work: refining the brief, routing critique findings, and summarising decisions.
- **Staleness.** Each artifact version records the exact upstream versions it was built from (`inputs: {research: 3, architecture: 2}`). When you approve or edit a new upstream version, every downstream artifact built from an older version is marked `stale`. The pipeline view shows this, and "rerun stale" reruns them in order.
- **Modes.**
  - *Approve each stage:* the run pauses at each gate after the DoD passes.
  - *Unattended:* a stage is auto-approved when its DoD passes. The run stops on a DoD failure after retries, or when it hits the budget cap.
  - *Single stage:* runs one stage against the currently approved upstream versions.
- **Definition of done.** Each agent has `dod.ts`: deterministic checks (schema, counts, citations present, every P0 screen has empty/error/loading states, Mermaid parses, contrast passes…) plus an optional rubric scored by an LLM. You can't approve a stage until the DoD is green, unless you explicitly override it, which is logged in the decision log.
- **Critique loop.** Severity 3–4 findings are grouped by `ownerStage`. Each owning stage reruns in *revision mode* (previous artifact + findings), then the stages downstream of it rerun through `ui`, then the critic runs again. This happens at most 2 times. Anything still unresolved is listed at the gate as open issues.
- **Runs** execute in a background worker in the Next server process, with the job queue in SQLite. After a crash, a run resumes from its last completed stage.

## 2. Agents

Each agent is a folder you can edit:

```
agents/researcher/
  prompt.md      # system prompt; frontmatter: tier, tools, maxTurns, subagents
  schema.ts      # zod output schema → JSON Schema for submit_artifact
  contract.ts    # input contract: which artifacts/state it reads
  dod.ts         # definition-of-done checks
  view.tsx       # rendered view of the artifact
```

Every agent ends its work by calling **`submit_artifact`**, whose input schema is the agent's output schema. If validation fails, the errors go back to the agent so it can fix them in the same session (up to 2 tries) before the stage counts as failed.

| Agent | Key tools | Output highlights |
|---|---|---|
| Researcher | WebSearch, WebFetch, read_uploads, 3 sub-agents | problem framing, competitors (each claim has `sources[]` with URL + access date), personas (each labelled `evidence` or `assumption`), JTBD, insights, HMW |
| Architect | validate_mermaid | journeys, task flows (Mermaid), sitemap, screen inventory (P0/P1/P2; required states per screen) |
| Content Designer | — | copy deck keyed by `screenId.elementId`, microcopy, error messages, voice notes |
| Wireframer | render_preview | screen specs using a grayscale wireframe kit; exactly one `primaryAction` per screen |
| Design System | Figma MCP read, import_tokens | DTCG `tokens.json`, a component map, and the platform kit (web/iOS/Android) |
| UI Designer | render_preview | per screen × state (default, hover, focus, disabled, loading, empty, error): JSX built from the themed kit |
| Critic | render_preview, run_axe | findings `{heuristic \| wcag SC, severity 1–4, screen, ownerStage, evidence, fix}` |
| Prototyper | bundle_prototype | standalone HTML/React prototype wired from the task flows, plus `handoff.md` |

Figma export is a separate "Push to Figma" action, run by a small agent with Figma MCP write tools. It writes wireframes and UI as frames and flows as FigJam diagrams, and stores the node IDs and links in the artifact's metadata.

## 3. Data model

**The files on disk are the source of truth. SQLite is an index and operational store that can be rebuilt from disk** (`pnpm rebuild-index`).

### Project folder (`$UXSTUDIO_HOME/projects/<slug>/`, default `~/UXStudio`)

```
<slug>/
  project.json             # name, platforms, mode, model overrides, budget, figma keys
  brief.md                 # living brief (orchestrator-maintained, you can edit)
  state/
    decisions.md           # append-only decision log (human readable)
    assumptions.json       # [{id, text, source stage, status: open|validated|rejected}]
    open-questions.json
  uploads/                 # your PDFs, images, CSVs, transcripts (+ .extracted.md)
  stages/
    01-research/
      current.json         # pointer: {version, status, approvedAt}
      v0001.json           # full snapshot: {meta, inputs, data}
      v0001.md             # rendered markdown (generated, for any editor/git)
    04-wireframes/
      v0003.json
      screens/v0003/<screenId>.tsx
    ...
  exports/                 # report.md, report.pdf, prototype/index.html, figma-links.md
  runs/<runId>/
    run.json               # mode, stages, status, totals
    calls.jsonl            # every agent call: prompt hash, model, messages, tools, usage, cost, latency, retries
```

Versions are full snapshots, not patches. They stay readable in any editor, and diffs are computed on demand (structural JSON diff plus a text diff of the rendered markdown). Edits you make in the app create a new version with `author: "me"`.

### SQLite (`$UXSTUDIO_HOME/index.db`, better-sqlite3 + Drizzle)

```
projects(id, slug, name, platforms, updated_at)
artifacts(project_id, stage, version, status[draft|approved|stale|failed], author, inputs_json, dod_json, created_at)
runs(id, project_id, mode, status, started_at, finished_at, cost_usd, budget_usd)
stage_runs(id, run_id, stage, attempt, loop, status, error)
agent_calls(id, stage_run_id, agent, model, input_tokens, output_tokens, cache_read, cache_write, cost_usd, latency_ms, retries, status)
jobs(id, run_id, payload, state, locked_at)          # background queue
```

## 4. Repository structure

```
ux-studio/
  app/                       # Next.js App Router
    page.tsx                 # project list
    p/[slug]/page.tsx        # pipeline view
    p/[slug]/[stage]/        # artifact viewer/editor, history, diff
    settings/ prompts/       # models, budget, keys check, prompt editor
    api/                     # runs, artifacts, uploads, SSE stream, exports
  agents/<agent>/            # prompt.md, schema.ts, contract.ts, dod.ts, view.tsx
  lib/
    orchestrator/            # stage graph, gates, staleness, critique loop, queue
    agent-runtime/           # runAgent(): SDK query, submit tool, streaming, retries, cost
    storage/                 # project fs, versions, diff, sqlite index + rebuild
    render/                  # screen-spec renderer, wireframe kit, UI kits (web/ios/android), device frames
    integrations/            # figma, uploads parsing, export (md/pdf/html)
  samples/briefs/            # 3 sample briefs
  scripts/
    run-pipeline.ts          # eval runner: pnpm eval [--brief] [--stages] [--label]
    rebuild-index.ts
  config/models.json         # tiers → model ids; per-agent tier overrides
  .env.example               # ANTHROPIC_API_KEY, UXSTUDIO_HOME
```

## 5. Tech choices
- **App:** Next.js 15, TypeScript strict, Tailwind, Radix primitives, CodeMirror (JSON/Markdown editing), Mermaid, jsondiffpatch + `diff`, ⌘K command palette with full keyboard shortcuts (`j/k` stages, `a` approve, `r` rerun, `e` edit, `d` diff, `?` help).
- **Agents:** `@anthropic-ai/claude-agent-sdk`. Custom tools are exposed through an in-process SDK MCP server. Streaming uses partial messages relayed to the browser over SSE. Each result message gives the per-call cost. Retries back off on 429/529/overloaded errors, and a stage can be retried on a schema or DoD failure.
- **Models (configurable):** `draft` tier = `claude-sonnet-5-5`, `strong` tier = `claude-opus-5-5`. You can override the model per agent and per project.
- **Rendering and QA:** Playwright (already local) for `render_preview` screenshots, axe-core checks, and PDF export. esbuild bundles the prototype.
- **Uploads:** pdf text extraction, CSV parsing (sampled + schema), images passed to the model as vision input, transcripts chunked.

## 6. Evals
- `samples/briefs/` holds three briefs:
  - a **mobile** (iOS + Android) habit/medication reminder app
  - a **web** B2B invoice-reconciliation dashboard
  - a **web + mobile** clinic booking flow
- `pnpm eval` runs them unattended into `eval-runs/<timestamp>/`. It records DoD pass/fail per stage, critic severity histograms, loop counts, cost, and time, keyed by the hash of each prompt. It writes a comparison report against the previous eval run, so you can see the effect of a prompt change.

## 7. Risks and mitigations
- **Figma remote MCP auth from a custom app.** Figma's hosted MCP only accepts approved clients. The Agent SDK runs on the Claude Code runtime, so the plan is to reuse Claude Code's Figma MCP connection: run `claude mcp add --transport http figma https://mcp.figma.com/mcp` once and authenticate. If that doesn't work, fall back to importing a tokens file; the export features then stay disabled.
- **Cost of long runs.** A per-run budget cap (default $5) pauses the run when reached. Prompt caching covers the shared brief and context. The cost meter shows live spend.
- **Demos in this cloud environment.** There is no `ANTHROPIC_API_KEY` here. Phase demos need either a key added to the environment's secrets, or the app's **replay mode**, which runs the pipeline from recorded fixture responses so it works with no key. Replay mode is useful for UI work and tests regardless.

## 8. Phases
- **(a)** Storage, orchestrator, researcher, pipeline view, and cost meter.
- **(b)** Architect, content designer, wireframer, and the wireframe kit.
- **(c)** Design system, UI designer, and Figma read and push.
- **(d)** Critic loop and prototyper.
- **(e)** Evals, exports, and polish.

Each phase ends with a run on a sample brief and a walkthrough.
