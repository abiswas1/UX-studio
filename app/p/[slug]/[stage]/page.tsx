import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { diffLines } from "diff";
import { getProject } from "@/lib/storage/projects";
import { getMarkdown, getPointer, getVersion, listVersions } from "@/lib/storage/artifacts";
import { stageById, type StageId } from "@/lib/stages";
import { agentForStage } from "@/lib/agents/registry";
import { stageStates } from "@/lib/orchestrator/status";
import { runningStages } from "@/lib/orchestrator/orchestrator";
import { ArtifactView, copyLookup, type ViewContext } from "@/components/ArtifactView";
import type { Content } from "@/agents/content/schema";
import type { DesignSystem } from "@/agents/design-system/schema";
import { SchemaEditor, type JsonSchema } from "@/components/SchemaEditor";
import { StageActions } from "@/components/StageActions";
import { StatusChip } from "@/components/StatusChip";
import { FigmaPush } from "@/components/FigmaControls";
import { CritiqueLoopButton } from "@/components/CritiqueLoopButton";
import { seriousFindings } from "@/agents/critic";
import type { Critique } from "@/agents/critic/schema";
import { listPushes } from "@/lib/figma/push";
import { isReplayMode } from "@/lib/runtime/models";

export const dynamic = "force-dynamic";

type Search = { v?: string; tab?: string; a?: string; b?: string };

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export default async function StagePage({ params, searchParams }: { params: Promise<{ slug: string; stage: string }>; searchParams: Promise<Search> }) {
  const { slug, stage } = await params;
  const sp = await searchParams;
  const project = await getProject(slug);
  const def = stageById(stage);
  const agent = def ? agentForStage(def.id) : undefined;
  if (!project || !def || !agent) notFound();

  const pointer = await getPointer(slug, def.id);
  const versions = await listVersions(slug, def.id);
  const states = await stageStates(slug, runningStages(slug));
  const state = states.find((s) => s.stage === def.id)!;
  const tab = sp.tab === "edit" || sp.tab === "history" ? sp.tab : "view";
  const vNum = Number(sp.v) || pointer?.latest || 0;
  const current = vNum ? await getVersion(slug, def.id, vNum) : null;
  // Visual stages get the full width when viewed; their side panels move below.
  const wide = tab === "view" && (def.id === "wireframes" || def.id === "ui" || def.id === "prototype");
  // Views that show copy (wireframes, UI) use the content version this artifact was built from.
  const viewContext: ViewContext = { platforms: project.platforms, slug, version: current?.meta.version ?? 0 };
  const contentRef = current?.meta.inputs.content;
  if (typeof contentRef === "number") {
    viewContext.lookup = copyLookup((await getVersion<Content>(slug, "content", contentRef))?.data);
  }
  const dsRef = current?.meta.inputs["design-system"];
  if (typeof dsRef === "number") {
    viewContext.designSystem = (await getVersion<DesignSystem>(slug, "design-system", dsRef))?.data ?? null;
  }
  const href = (q: Record<string, string | number | undefined>) =>
    `/p/${slug}/${stage}?` + new URLSearchParams(Object.entries({ v: vNum, ...q }).filter(([, x]) => x !== undefined).map(([k, x]) => [k, String(x)])).toString();

  // Comparison between two versions (history tab), on the rendered markdown.
  let diff: { added?: boolean; removed?: boolean; value: string }[] | null = null;
  const a = Number(sp.a) || (versions[1]?.version ?? 0);
  const b = Number(sp.b) || (versions[0]?.version ?? 0);
  if (tab === "history" && a && b && a !== b) {
    const [ma, mb] = await Promise.all([getMarkdown(slug, def.id, a), getMarkdown(slug, def.id, b)]);
    if (ma && mb) diff = diffLines(ma.replace(/^<!--.*-->\n\n/, ""), mb.replace(/^<!--.*-->\n\n/, ""));
  }

  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand">UX Studio</Link>
        <nav className="crumbs" aria-label="Breadcrumb">
          <span>/</span><Link href={`/p/${slug}`}>{project.name}</Link><span>/</span><span>{def.title}</span>
        </nav>
        <span className="spacer" />
        <span className="faint">Press <kbd>?</kbd> for shortcuts</span>
      </header>
      <main className="page">
        <div className="row" style={{ marginBottom: 12 }}>
          <h1 style={{ margin: 0 }}>{def.title}</h1>
          <StatusChip status={state.status} />
          <span style={{ flex: 1 }} />
          {current && (
            <StageActions
              slug={slug}
              stage={def.id}
              version={current.meta.version}
              isLatest={current.meta.version === pointer?.latest}
              isApproved={current.meta.version === pointer?.approved}
              dodPassed={current.meta.dod.passed}
              tab={tab}
            />
          )}
        </div>

        {!current ? (
          <div className="empty">Nothing here yet. Run this stage from the <Link href={`/p/${slug}`}>pipeline</Link>.</div>
        ) : (
          <div className={wide ? "wide-layout" : "grid-2"}>
            <div>
              <nav className="tabs" aria-label="Views">
                <Link className={tab === "view" ? "active" : ""} href={href({})}>View</Link>
                <Link className={tab === "edit" ? "active" : ""} href={href({ tab: "edit" })}>Edit <kbd>e</kbd></Link>
                <Link className={tab === "history" ? "active" : ""} href={href({ tab: "history" })}>History <kbd>h</kbd></Link>
              </nav>

              {current.meta.replay && tab !== "history" && (
                <div className="notice warn" style={{ marginBottom: 16 }}>
                  Sample output from replay mode, recorded for this sample brief — not a live run. Add your API key to run the real agents.
                </div>
              )}
              {state.status === "stale" && tab === "view" && (
                <div className="notice warn" style={{ marginBottom: 16 }}>
                  Out of date: {state.staleBecause?.map((s) => (s === "brief" ? "the brief or uploads" : s)).join(", ")} changed since this was made.
                </div>
              )}
              {current.meta.version !== pointer?.latest && tab !== "history" && (
                <div className="notice" style={{ marginBottom: 16 }}>
                  You're looking at version {current.meta.version}. <Link href={`/p/${slug}/${stage}`}>Go to the latest (version {pointer?.latest})</Link>
                </div>
              )}

              {tab === "view" && <ArtifactView stage={def.id} data={current.data} context={viewContext} />}

              {tab === "edit" && (
                <SchemaEditor slug={slug} stage={def.id} schema={z.toJSONSchema(agent.schema) as JsonSchema} initial={current.data} basedOn={current.meta.version} />
              )}

              {tab === "history" && (
                <div className="stack">
                  {versions.length < 2 ? (
                    <p className="muted">Only one version so far. Edits and re-runs add versions you can compare here.</p>
                  ) : (
                    <>
                      <form className="row" method="get">
                        <input type="hidden" name="tab" value="history" />
                        <input type="hidden" name="v" value={vNum} />
                        <label htmlFor="a" style={{ margin: 0 }}>Compare</label>
                        <select id="a" name="a" defaultValue={a} style={{ width: "auto" }}>
                          {versions.map((m) => <option key={m.version} value={m.version}>Version {m.version}</option>)}
                        </select>
                        <label htmlFor="b" style={{ margin: 0 }}>with</label>
                        <select id="b" name="b" defaultValue={b} style={{ width: "auto" }}>
                          {versions.map((m) => <option key={m.version} value={m.version}>Version {m.version}</option>)}
                        </select>
                        <button className="small">Compare</button>
                      </form>
                      {diff ? (
                        <div className="diff" aria-label={`Changes from version ${a} to version ${b}`}>
                          {diff.flatMap((part, i) => {
                            let lines = part.value.replace(/\n$/, "").split("\n");
                            // Keep a little context around changes; fold long unchanged stretches.
                            let folded = 0;
                            if (!part.added && !part.removed && lines.length > 7) {
                              const head = i === 0 ? [] : lines.slice(0, 3);
                              const tail = i === diff!.length - 1 ? [] : lines.slice(-3);
                              folded = lines.length - head.length - tail.length;
                              lines = [...head, "\u0000", ...tail];
                            }
                            return lines.map((line, j) =>
                              line === "\u0000" ? (
                                <div key={`${i}-${j}`} className="same" style={{ fontStyle: "italic" }}>… {folded} unchanged lines</div>
                              ) : (
                                <div key={`${i}-${j}`} className={part.added ? "add" : part.removed ? "del" : "same"}>
                                  <span className="sr-only">{part.added ? "Added: " : part.removed ? "Removed: " : ""}</span>
                                  {part.added ? "+ " : part.removed ? "− " : "  "}{line || " "}
                                </div>
                              ),
                            );
                          })}
                        </div>
                      ) : <p className="muted">Pick two different versions.</p>}
                    </>
                  )}
                </div>
              )}
            </div>

            <aside className="stack">
              {(def.id === "ui" || def.id === "wireframes" || def.id === "architecture") && (
                <FigmaPush
                  slug={slug}
                  stage={def.id}
                  pushes={(await listPushes(slug)).filter((p) => p.stage === def.id)}
                  hasFile={!!project.figmaFileUrl}
                  replay={isReplayMode()}
                />
              )}
              {def.id === "critique" && current.meta.version === pointer?.latest && (
                <CritiqueLoopButton
                  slug={slug}
                  serious={seriousFindings(current.data as Critique).length}
                  round={Number(current.meta.note?.match(/round (\d)/)?.[1]) || 0}
                />
              )}
              <div className="card">
                <h3>Done-checks for version {current.meta.version}</h3>
                <ul className="dod">
                  {current.meta.dod.checks.map((c) => (
                    <li key={c.id}>
                      <span className={c.passed ? "ok" : "no"} aria-label={c.passed ? "Passed" : "Failed"}>{c.passed ? "✓" : "✗"}</span>
                      <span>{c.label}{c.detail ? <span className="faint"> — {c.detail}</span> : null}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="card">
                <h3>Versions</h3>
                <ul className="versions">
                  {versions.map((m) => (
                    <li key={m.version}>
                      <Link href={`/p/${slug}/${stage}?v=${m.version}`} style={{ fontWeight: m.version === vNum ? 700 : 400 }}>Version {m.version}</Link>
                      {m.version === pointer?.approved && <span className="chip good">Approved</span>}
                      <span className="faint" style={{ width: "100%" }}>
                        {m.author === "me" ? `Your edit of v${m.basedOn}` : `${m.model ?? "Agent"}`} · {when(m.createdAt)}
                        {m.costUsd ? ` · $${m.costUsd.toFixed(2)}` : ""}
                        {m.note ? ` · “${m.note}”` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="card faint">
                Saved on disk in <code>stages/{def.folder}/</code> as JSON with a Markdown copy you can open in any editor.
              </div>
            </aside>
          </div>
        )}
      </main>
    </>
  );
}
