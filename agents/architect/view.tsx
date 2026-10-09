import { Mermaid } from "@/components/Mermaid";
import { REQUIRED_P0_STATES, type Architecture } from "./schema";
import { sitemapMermaid } from "./sitemap";

const PRIORITY_CLASS: Record<string, string> = { P0: "accent", P1: "", P2: "quiet" };

export function ArchitectureView({ data: a }: { data: Architecture }) {
  return (
    <div className="artifact">
      <section>
        <h2>Screen inventory</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Screen</th><th>Priority</th><th>Primary action</th><th>States</th></tr>
            </thead>
            <tbody>
              {a.screens.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong><div className="faint mono">{s.id}</div><div className="faint">{s.purpose}</div></td>
                  <td><span className={`chip ${PRIORITY_CLASS[s.priority]}`}>{s.priority}</span></td>
                  <td>{s.primaryAction}</td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      {s.states.map((x) => <span key={x.state} className="badge" title={x.description}>{x.state}</span>)}
                      {s.statesNotNeeded.map((x) => <span key={x.state} className="badge" style={{ textDecoration: "line-through" }} title={`Not needed: ${x.reason}`}>{x.state}</span>)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="faint">P0 screens must cover {REQUIRED_P0_STATES.join(", ")}. Hover a state for its description; struck-through states were ruled out with a reason.</p>
      </section>

      <section>
        <h2>Task flows</h2>
        {a.flows.map((f) => (
          <div className="item" key={f.id}>
            <h3>{f.id}. {f.name}</h3>
            <p className="muted">Starts when: {f.trigger}</p>
            <div className="grid-flow">
              <Mermaid source={f.mermaid} label={`Flow diagram: ${f.name}`} />
              <ol style={{ margin: 0 }}>{f.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
            </div>
          </div>
        ))}
      </section>

      <section>
        <h2>Sitemap</h2>
        <Mermaid source={sitemapMermaid(a)} label="Sitemap diagram" />
      </section>

      <section>
        <h2>Journeys</h2>
        {a.journeys.map((j) => (
          <div className="item" key={j.id}>
            <h3>{j.id}. {j.persona}</h3>
            <p className="muted">Goal: {j.goal}</p>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Stage</th><th>Actions</th><th>Pain points</th><th>Opportunities</th></tr></thead>
                <tbody>
                  {j.stages.map((s) => (
                    <tr key={s.stage}>
                      <td><strong>{s.stage}</strong></td>
                      <td>{s.actions.join("; ")}</td>
                      <td>{s.painPoints.join("; ")}</td>
                      <td>{s.opportunities.join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>

      <section className="cols">
        <div><h2>Assumptions</h2><ul>{a.assumptions.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        <div><h2>Open questions</h2><ul>{a.openQuestions.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      </section>
    </div>
  );
}
