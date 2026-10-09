"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PushRecord } from "@/lib/figma/push";

async function call(url: string, body: unknown, method = "POST") {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json;
}

/** Project-level card: connect a Figma file. */
export function FigmaFileCard({ slug, url }: { slug: string; url?: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!url);
  const [value, setValue] = useState(url ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await call(`/api/projects/${slug}`, { figmaFileUrl: value.trim() }, "PATCH");
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 6 }}>
        <h3 style={{ margin: 0, flex: 1 }}>Figma</h3>
        {!editing && <button className="small ghost" onClick={() => setEditing(true)}>Change</button>}
      </div>
      {editing ? (
        <div className="stack" style={{ gap: 8 }}>
          <label htmlFor="figma-url" className="sr-only">Figma file link</label>
          <input id="figma-url" type="text" value={value} placeholder="https://www.figma.com/design/…" onChange={(e) => setValue(e.target.value)} />
          <p className="faint" style={{ margin: 0 }}>The Design system reads the libraries attached to this file, and &quot;Push to Figma&quot; adds screens to it.</p>
          {error && <div className="notice bad">{error}</div>}
          <div className="row">
            <button className="primary small" onClick={save} disabled={busy}>Save</button>
            {url && <button className="small ghost" onClick={() => setEditing(false)}>Cancel</button>}
          </div>
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 14 }}><a href={url} target="_blank" rel="noreferrer">Open your Figma file</a></p>
      )}
    </div>
  );
}

/** Stage-level control: push this stage to Figma and list earlier pushes. */
export function FigmaPush({ slug, stage, pushes, hasFile, replay }: { slug: string; stage: "ui" | "wireframes" | "architecture"; pushes: PushRecord[]; hasFile: boolean; replay: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const label = stage === "architecture" ? "Send flows to FigJam" : "Push to Figma";
  const blocked = replay ? "Needs live mode (API key) and a Figma connection." : !hasFile && stage !== "architecture" ? "Add your Figma file on the project page first." : "";
  const push = async () => {
    setBusy(true);
    setError("");
    try {
      await call(`/api/projects/${slug}/figma`, { stage });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card">
      <h3>Figma</h3>
      <button onClick={push} disabled={busy || !!blocked}>{busy ? "Pushing…" : label}</button>
      {blocked && <p className="faint" style={{ margin: "6px 0 0" }}>{blocked}</p>}
      {error && <div className="notice bad" style={{ marginTop: 8 }}>{error}</div>}
      {pushes.length > 0 && (
        <ul className="versions" style={{ marginTop: 8 }}>
          {pushes.slice(0, 3).map((p) => (
            <li key={p.at}>
              <span className="faint" style={{ width: "100%" }}>Version {p.version} · {new Date(p.at).toLocaleString()}</span>
              {p.items.map((it) => <a key={it.url} href={it.url} target="_blank" rel="noreferrer">{it.label}</a>)}
              {p.errors.map((e, i) => <span key={i} className="faint" style={{ color: "var(--bad)" }}>{e}</span>)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
