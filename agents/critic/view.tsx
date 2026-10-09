import type { Critique } from "./schema";

const SEV: Record<number, [string, string]> = { 4: ["Catastrophic", "bad"], 3: ["Major", "bad"], 2: ["Minor", "warn"], 1: ["Cosmetic", "quiet"] };

export function CritiqueView({ data: c }: { data: Critique }) {
  const findings = [...c.findings].sort((a, b) => b.severity - a.severity);
  const counts = [4, 3, 2, 1].map((s) => [s, c.findings.filter((f) => f.severity === s).length] as const);
  return (
    <div className="artifact">
      <section>
        <p style={{ fontSize: 17 }}>{c.summary}</p>
        <div className="row" style={{ gap: 8 }}>
          {counts.map(([s, n]) => <span key={s} className={`chip ${SEV[s][1]}`}>{n} {SEV[s][0].toLowerCase()}</span>)}
        </div>
      </section>
      <section>
        <h2>Findings</h2>
        {findings.length === 0 && <p className="muted">No findings.</p>}
        {findings.map((f) => (
          <div className="item" key={f.id}>
            <div className="row" style={{ gap: 8 }}>
              <span className={`chip ${SEV[f.severity][1]}`}>{f.severity} · {SEV[f.severity][0]}</span>
              <strong style={{ flex: 1 }}>{f.id}. {f.title}</strong>
              <span className="badge">{f.source === "automated" ? "Automated check" : "Review"}</span>
            </div>
            <p className="faint" style={{ margin: "4px 0" }}>{f.heuristic || f.wcag} · fix owner: <strong>{f.ownerStage}</strong>{f.locations.length ? ` · ${f.locations.map((l) => `${l.screenId}/${l.state}`).join(", ")}` : ""}</p>
            <p style={{ margin: "4px 0" }}>{f.detail}</p>
            <p className="muted" style={{ margin: "4px 0" }}>Evidence: {f.evidence}</p>
            <p style={{ margin: 0 }}><span className="muted">Recommendation:</span> {f.recommendation}</p>
          </div>
        ))}
      </section>
      <section className="cols">
        <div>
          <h2>Heuristics</h2>
          <ul className="dod">
            {c.heuristicsReviewed.map((h) => (
              <li key={h.heuristic}>
                <span className={h.verdict === "issues" ? "no" : "ok"}>{h.verdict === "issues" ? "!" : h.verdict === "good" ? "✓" : "–"}</span>
                <span><strong>{h.heuristic}</strong><span className="faint"> — {h.note}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2>WCAG 2.2 AA</h2>
          <ul className="dod">
            {c.wcagChecked.map((w) => (
              <li key={w.criterion}>
                <span className={w.result === "fail" ? "no" : "ok"}>{w.result === "fail" ? "✗" : w.result === "pass" ? "✓" : "?"}</span>
                <span><strong>{w.criterion}</strong><span className="faint"> — {w.result}. {w.note}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section><h2>Strengths</h2><ul>{c.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></section>
    </div>
  );
}
