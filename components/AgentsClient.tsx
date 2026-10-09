"use client";
import { useEffect, useState } from "react";
import type { AgentSettings } from "@/lib/agents/settings";
import { useHotkeys } from "./useHotkeys";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function AgentsClient(props: { agents: AgentSettings[]; tiers: Record<string, string>; budget: number; replay: boolean }) {
  const [agents, setAgents] = useState(props.agents);
  const [sel, setSel] = useState(0);
  const agent = agents[sel];
  const [draft, setDraft] = useState(agent.raw);
  const [tiers, setTiers] = useState(props.tiers);
  const [budget, setBudget] = useState(String(props.budget));
  const [msg, setMsg] = useState<{ kind: "good" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = draft !== agent.raw;

  useEffect(() => setDraft(agents[sel].raw), [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (i: number) => {
    if (dirty && !confirm("Discard your unsaved changes to these instructions?")) return;
    setMsg(null);
    setSel(i);
  };
  useHotkeys({
    j: () => pick(Math.min(agents.length - 1, sel + 1)),
    k: () => pick(Math.max(0, sel - 1)),
  });

  async function patch(body: unknown, done: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/agents", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setAgents(json.agents);
      setMsg({ kind: "good", text: done });
      return json.agents as AgentSettings[];
    } catch (e) {
      setMsg({ kind: "bad", text: (e as Error).message });
      return null;
    } finally {
      setBusy(false);
    }
  }

  const save = () => dirty && patch({ agent: agent.id, raw: draft }, "Saved. The next run of this agent uses the new instructions.");

  async function loadOld(id: string) {
    const res = await fetch(`/api/agents?agent=${agent.id}&history=${id}`);
    const json = await res.json();
    if (res.ok) {
      setDraft(json.raw);
      setMsg({ kind: "good", text: "Earlier version loaded into the editor. Save to use it." });
    }
  }

  return (
    <div className="agents-layout">
      <nav className="card agents-list" aria-label="Agents">
        <ol>
          {agents.map((a, i) => (
            <li key={a.id}>
              <button className={i === sel ? "active" : ""} aria-current={i === sel} onClick={() => pick(i)}>
                <span>{a.title}</span>
                <span className="faint">{a.tier === "strong" ? "Strong" : "Draft"}</span>
              </button>
            </li>
          ))}
        </ol>
        <p className="faint" style={{ fontSize: 12, margin: "10px 6px 0" }}><kbd>j</kbd> / <kbd>k</kbd> to move</p>
      </nav>

      <section className="stack">
        <div className="card">
          <div className="row" style={{ marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: 0 }}>{agent.title}</h2>
              <div className="faint">{agent.summary}</div>
            </div>
            <label htmlFor="tier" className="faint">Model</label>
            <select id="tier" style={{ width: "auto" }} value={agent.tier} disabled={busy}
              onChange={(e) => patch({ agent: agent.id, tier: e.target.value }, `${agent.title} now uses the ${e.target.value} model.`)}>
              {Object.entries(tiers).map(([k, v]) => <option key={k} value={k}>{k === "strong" ? "Strong" : "Draft"} · {v}</option>)}
            </select>
          </div>
          <label htmlFor="prompt" className="sr-only">Instructions for {agent.title}</label>
          <textarea id="prompt" className="prompt-editor" value={draft} spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); save(); } }} />
          <div className="row" style={{ marginTop: 10 }}>
            <button className="primary" onClick={save} disabled={!dirty || busy}>Save <kbd>⌘S</kbd></button>
            <button onClick={() => setDraft(agent.raw)} disabled={!dirty || busy}>Undo changes</button>
            <span className="spacer" style={{ flex: 1 }} />
            {msg && <span className={`notice ${msg.kind}`} role="status">{msg.text}</span>}
          </div>
          <p className="faint" style={{ fontSize: 13, marginBottom: 0 }}>
            The lines between <code>---</code> at the top are settings (for example <code>maxTurns</code>, how many steps the agent may take).
            To compare a change across the sample briefs, run <code>npm run pipeline -- --label &quot;what I changed&quot;</code>{props.replay ? " (needs your API key; replay mode plays back recordings)" : ""}.
          </p>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Earlier versions</h3>
          {agent.history.length === 0 ? (
            <p className="faint" style={{ margin: 0 }}>None yet. Each time you save, the previous instructions are kept here.</p>
          ) : (
            <ul className="plain">
              {agent.history.map((h) => (
                <li key={h.id} className="row">
                  <span style={{ flex: 1 }}>{when(h.savedAt)}</span>
                  <button className="small" onClick={() => loadOld(h.id)}>Load into editor</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Defaults for every project</h3>
          <div className="row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
            {Object.keys(tiers).map((k) => (
              <label key={k} style={{ flex: 1, minWidth: 200 }}>
                <span className="faint">{k === "strong" ? "Strong model" : "Draft model"}</span>
                <input value={tiers[k]} onChange={(e) => setTiers({ ...tiers, [k]: e.target.value })} />
              </label>
            ))}
            <label style={{ width: 150 }}>
              <span className="faint">Budget per run ($)</span>
              <input type="number" min="0.5" step="0.5" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </label>
            <button disabled={busy} onClick={() => patch({ tiers, budgetUsdPerRun: Number(budget) }, "Defaults saved.")}>Save defaults</button>
          </div>
        </div>
      </section>
    </div>
  );
}
