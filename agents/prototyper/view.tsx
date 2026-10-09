import type { Prototype } from "./schema";

export function PrototypeView({ data: p, slug, version }: { data: Prototype; slug: string; version: number }) {
  const src = `/api/projects/${slug}/prototype?v=${version}`;
  const h = p.handoff;
  return (
    <div className="artifact">
      <section>
        <div className="row" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0, border: 0, flex: 1 }}>Clickable prototype</h2>
          <a className="btn small" href={src} target="_blank" rel="noreferrer">Open full screen</a>
          <a className="btn small" href={`${src}&download=1`}>Download HTML</a>
          <a className="btn small" href={`/api/projects/${slug}/prototype?handoff=1`}>Download handoff (.md)</a>
        </div>
        <iframe title="Clickable prototype" src={src} className="proto-frame" />
        <p className="faint">{p.links.length} links · starts on {p.entry.screenId}/{p.entry.state}. Click highlighted elements; press H inside the prototype to show all hotspots.</p>
      </section>

      <section>
        <h2>Handoff</h2>
        <p>{h.overview}</p>
        {h.openIssues.length > 0 && (
          <div className="notice warn" style={{ marginBottom: 12 }}>
            <strong>Open issues</strong>
            <ul style={{ margin: "4px 0 0" }}>{h.openIssues.map((o) => <li key={o.findingId}>{o.findingId} (severity {o.severity}) {o.title} — {o.plan}</li>)}</ul>
          </div>
        )}
        {h.screens.map((s) => (
          <div className="item" key={s.screenId}>
            <h3 className="mono">{s.screenId}</h3>
            <p className="muted">{s.purpose}</p>
            <div className="cols">
              <div><h4>Behaviour</h4><ul>{s.behaviour.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
              <div><h4>Acceptance criteria</h4><ul>{s.acceptanceCriteria.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
              {s.edgeCases.length > 0 && <div><h4>Edge cases</h4><ul>{s.edgeCases.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
              {s.data.length > 0 && <div><h4>Data</h4><ul>{s.data.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
            </div>
          </div>
        ))}
      </section>
      <section className="cols">
        <div><h2>Accessibility</h2><ul>{h.accessibility.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        <div><h2>Components</h2><ul>{h.components.map((c) => <li key={c.name}><strong>{c.name}</strong>: {c.notes}</li>)}</ul></div>
        {h.analytics.length > 0 && <div><h2>Analytics</h2><ul>{h.analytics.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
      </section>
      {p.staticActions.length > 0 && (
        <section>
          <h2>Not wired in this prototype</h2>
          <ul>{p.staticActions.map((a, i) => <li key={i}><span className="mono">{a.screenId}/{a.state} · {a.element}</span> — {a.reason}</li>)}</ul>
        </section>
      )}
    </div>
  );
}
