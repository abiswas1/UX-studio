import type { Research } from "./schema";

function Basis({ basis }: { basis: string }) {
  return <span className={`tag ${basis}`}>{basis === "evidence" ? "Evidence" : "Assumption"}</span>;
}

function List({ items }: { items: string[] }) {
  return items.length ? <ul>{items.map((t, i) => <li key={i}>{t}</li>)}</ul> : <p className="faint">None.</p>;
}

export function ResearchView({ data: r }: { data: Research }) {
  return (
    <div className="artifact">
      <section>
        <h2>Problem</h2>
        <p style={{ fontSize: 17 }}>{r.problem.statement}</p>
        <p className="muted">{r.problem.context}</p>
        <div className="cols">
          <div><h3>Who is affected</h3><List items={r.problem.whoIsAffected} /></div>
          <div><h3>What people do today</h3><List items={r.problem.currentAlternatives} /></div>
          <div><h3>Constraints</h3><List items={r.problem.constraints} /></div>
          <div><h3>Signs of success</h3><List items={r.problem.successSignals} /></div>
        </div>
      </section>

      <section>
        <h2>Competitors and alternatives</h2>
        {r.competitors.map((c) => (
          <div className="item" key={c.name}>
            <div className="row" style={{ gap: 8 }}>
              <h3 style={{ margin: 0 }}><a href={c.url} target="_blank" rel="noreferrer">{c.name}</a></h3>
              <span className="badge">{c.category}</span>
            </div>
            <p style={{ marginTop: 6 }}>{c.summary}</p>
            <div className="cols">
              <div><h4>Strengths</h4><List items={c.strengths} /></div>
              <div><h4>Weaknesses</h4><List items={c.weaknesses} /></div>
              {c.notablePatterns.length > 0 && <div><h4>Patterns to note</h4><List items={c.notablePatterns} /></div>}
            </div>
            <div className="sources">
              Sources:{" "}
              {c.sources.map((s, i) => (
                <span key={s.url + i}>{i > 0 && ", "}<a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> (read {s.accessed})</span>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section>
        <h2>Personas</h2>
        <div className="cols">
          {r.personas.map((p) => (
            <div className="card" key={p.name}>
              <div className="row" style={{ gap: 8, marginBottom: 6 }}><h3 style={{ margin: 0 }}>{p.name}</h3><Basis basis={p.basis} /></div>
              <p className="muted">{p.context}</p>
              <h4>Goals</h4><List items={p.goals} />
              <h4>Frustrations</h4><List items={p.frustrations} />
              {p.behaviours.length > 0 && (<><h4>Behaviours</h4><List items={p.behaviours} /></>)}
              <p className="faint" style={{ margin: 0 }}>Based on: {p.basisNote}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Jobs to be done</h2>
        {r.jobs.map((j, i) => (
          <div className="item" key={i}>
            When <strong>{j.situation}</strong>, I want to <strong>{j.motivation}</strong>, so I can <strong>{j.outcome}</strong>. <Basis basis={j.basis} />
          </div>
        ))}
      </section>

      <section>
        <h2>Insights</h2>
        {r.insights.map((i) => (
          <div className="item" key={i.id}>
            <div className="row" style={{ gap: 8 }}><strong>{i.id}</strong><span style={{ flex: 1, fontWeight: 600 }}>{i.insight}</span><Basis basis={i.basis} /></div>
            <p style={{ margin: "4px 0" }}><span className="muted">Implication:</span> {i.implication}</p>
            {i.supportedBy.length > 0 && <div className="sources">Supported by: {i.supportedBy.join(", ")}</div>}
          </div>
        ))}
      </section>

      <section>
        <h2>How might we</h2>
        <ul>
          {r.hmw.map((h, i) => <li key={i}>{h.question} <span className="faint">from {h.linkedInsights.join(", ")}</span></li>)}
        </ul>
      </section>

      {r.uploadsSynthesis.length > 0 && (
        <section>
          <h2>Uploaded research</h2>
          {r.uploadsSynthesis.map((u) => <div className="item" key={u.file}><h3>{u.file}</h3><List items={u.keyFindings} /></div>)}
        </section>
      )}

      <section className="cols">
        <div><h2>Assumptions</h2><List items={r.assumptions} /></div>
        <div><h2>Open questions</h2><List items={r.openQuestions} /></div>
      </section>
    </div>
  );
}
