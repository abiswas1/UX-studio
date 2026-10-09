import type { Content } from "./schema";

export function ContentView({ data: c }: { data: Content }) {
  return (
    <div className="artifact">
      <section>
        <h2>Voice</h2>
        <ul>{c.voice.principles.map((p, i) => <li key={i}><strong>{p}</strong></li>)}</ul>
        {c.voice.toneByContext.length > 0 && (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>When</th><th>Tone</th></tr></thead>
              <tbody>{c.voice.toneByContext.map((t) => <tr key={t.context}><td>{t.context}</td><td>{t.tone}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        {c.voice.glossary.length > 0 && (
          <>
            <h3 style={{ marginTop: 16 }}>Glossary</h3>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Say</th><th>Meaning</th><th>Don't say</th></tr></thead>
                <tbody>{c.voice.glossary.map((g) => <tr key={g.term}><td><strong>{g.term}</strong></td><td>{g.use}</td><td className="muted">{g.avoid.join(", ")}</td></tr>)}</tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section>
        <h2>Copy by screen</h2>
        {c.screens.map((s) => (
          <div className="item" key={s.screenId}>
            <h3 className="mono">{s.screenId}</h3>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Text</th><th>Kind</th><th>State</th><th>Key</th></tr></thead>
                <tbody>
                  {s.strings.map((x) => (
                    <tr key={x.key}>
                      <td>{x.kind === "button" ? <span className="copy-button">{x.text}</span> : x.text}{x.notes && <div className="faint">{x.notes}</div>}</td>
                      <td>{x.kind}</td>
                      <td>{x.state}</td>
                      <td className="faint mono">{x.key}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>

      <section>
        <h2>Error messages</h2>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>When</th><th>Message</th><th>Way forward</th><th>Screen</th></tr></thead>
            <tbody>
              {c.errors.map((e) => (
                <tr key={e.id}>
                  <td>{e.situation}</td>
                  <td>{e.message}</td>
                  <td>{e.action ? <span className="copy-button">{e.action}</span> : <span className="faint">In the message</span>}</td>
                  <td className="faint mono">{e.screenId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {c.notifications.length > 0 && (
        <section>
          <h2>Notifications</h2>
          {c.notifications.map((n) => (
            <div className="notification" key={n.id}>
              <div className="faint">{n.trigger}</div>
              <strong>{n.title}</strong>
              <div>{n.body}</div>
            </div>
          ))}
        </section>
      )}

      <section className="cols">
        <div><h2>Assumptions</h2><ul>{c.assumptions.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        <div><h2>Open questions</h2><ul>{c.openQuestions.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      </section>
    </div>
  );
}
