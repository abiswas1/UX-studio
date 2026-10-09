import { PALETTE_ROLES, TYPE_ROLES, type DesignSystem } from "./schema";
import { contrastReport } from "./index";

const PLATFORM: Record<string, string> = { ios: "iOS", android: "Android", web: "Web" };

export function DesignSystemView({ data: ds }: { data: DesignSystem }) {
  const report = contrastReport(ds);
  return (
    <div className="artifact">
      <section>
        <h2>Source</h2>
        <p><span className="badge">{ds.source.kind === "figma" ? "Figma libraries" : ds.source.kind === "tokens" ? "Tokens file" : "Generated"}</span> {ds.source.notes}</p>
        {ds.libraries.length > 0 && (
          <ul>{ds.libraries.map((l) => <li key={l.libraryKey}><strong>{l.name}</strong> — {l.platforms.map((p) => PLATFORM[p]).join(", ")}: {l.usage}</li>)}</ul>
        )}
        <ul>{ds.principles.map((p, i) => <li key={i}>{p}</li>)}</ul>
      </section>

      {ds.themes.map((t) => (
        <section key={t.platform}>
          <h2>{PLATFORM[t.platform]} · {t.library}</h2>
          <div className="cols" style={{ marginBottom: 12 }}>
            {(["light", "dark"] as const).map((mode) => {
              const pal = t.color[mode];
              return (
                <div key={mode} className="ds-preview" style={{ background: pal.background, color: pal.text, fontFamily: `${t.fontFamily}, ${t.fallbackFont}` }}>
                  <div style={{ fontSize: 12, color: pal.textMuted, marginBottom: 6 }}>{mode === "light" ? "Light" : "Dark"} mode</div>
                  <div style={{ background: pal.surface, borderRadius: t.radius.lg, padding: 12, border: `1px solid ${pal.border}` }}>
                    <div style={{ fontSize: t.type.title.size, lineHeight: `${t.type.title.lineHeight}px`, fontWeight: t.type.title.weight }}>Metformin 500 mg</div>
                    <div style={{ fontSize: t.type.body.size, lineHeight: `${t.type.body.lineHeight}px`, color: pal.textMuted }}>Due at 8:00 PM</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      <span style={{ background: pal.primary, color: pal.onPrimary, borderRadius: t.radius.full, padding: "0 16px", minHeight: t.minTarget, display: "inline-flex", alignItems: "center", fontWeight: t.type.label.weight, fontSize: t.type.label.size }}>Mark as taken</span>
                      <span style={{ color: pal.primary, minHeight: t.minTarget, display: "inline-flex", alignItems: "center", padding: "0 8px", fontWeight: t.type.label.weight, fontSize: t.type.label.size }}>Skip</span>
                    </div>
                  </div>
                  <div style={{ background: pal.dangerContainer, color: pal.onDangerContainer, borderRadius: t.radius.md, padding: "8px 12px", marginTop: 10, fontSize: t.type.caption.size }}>We couldn&apos;t save your answer.</div>
                  <div className="swatches">
                    {PALETTE_ROLES.map((r) => (
                      <span key={r} title={`${r}: ${pal[r]}`}><i style={{ background: pal[r] }} />{r}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Type role</th><th>Sample</th><th>Size / line</th><th>Weight</th></tr></thead>
              <tbody>
                {TYPE_ROLES.map((r) => (
                  <tr key={r}>
                    <td>{r}</td>
                    <td style={{ fontFamily: `${t.fontFamily}, ${t.fallbackFont}`, fontSize: Math.min(t.type[r].size, 36), lineHeight: 1.2, fontWeight: t.type[r].weight }}>Time for Metformin</td>
                    <td className="mono">{t.type[r].size}/{t.type[r].lineHeight}</td>
                    <td className="mono">{t.type[r].weight}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="faint">
            Font {t.fontFamily} · minimum target {t.minTarget} · radius {t.radius.sm}/{t.radius.md}/{t.radius.lg} · spacing {t.spacing.join(", ")}
          </p>
          {t.provenance.length > 0 && (
            <details>
              <summary className="faint">Where these values came from</summary>
              <ul className="faint">{t.provenance.map((p, i) => <li key={i}><span className="mono">{p.token}</span> ← {p.from}</li>)}</ul>
            </details>
          )}
        </section>
      ))}

      <section>
        <h2>Contrast (WCAG 2.2 AA)</h2>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Platform</th><th>Mode</th><th>Pair</th><th>Ratio</th><th>Needs</th></tr></thead>
            <tbody>
              {report.map((r, i) => (
                <tr key={i}>
                  <td>{PLATFORM[r.platform]}</td><td>{r.mode}</td><td>{r.label}</td>
                  <td><span className={`chip ${r.passed ? "good" : "bad"}`}>{r.ratio}:1</span></td>
                  <td className="faint">{r.min}:1</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Component mapping</h2>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Block</th><th>Platform</th><th>Component</th><th>Notes</th></tr></thead>
            <tbody>
              {ds.components.map((c, i) => (
                <tr key={i}>
                  <td className="mono">{c.block}{c.variant ? `/${c.variant}` : ""}</td>
                  <td>{PLATFORM[c.platform]}</td>
                  <td><strong>{c.component}</strong><div className="faint">{c.library}</div></td>
                  <td className="faint">{c.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="cols">
        <div><h2>Assumptions</h2><ul>{ds.assumptions.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        <div><h2>Open questions</h2><ul>{ds.openQuestions.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      </section>
    </div>
  );
}
