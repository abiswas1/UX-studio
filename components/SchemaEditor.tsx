"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Form editor driven by the agent's output schema (as JSON Schema), so every stage gets
// direct editing without a hand-built form. Raw JSON editing is available as a fallback.

export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: string[];
  description?: string;
  format?: string;
}

type Path = (string | number)[];

function humanize(key: string): string {
  const map: Record<string, string> = { hmw: "How might we", jobs: "Jobs to be done", url: "URL", id: "ID" };
  if (map[key]) return map[key];
  const words = key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function typeOf(s: JsonSchema): string {
  if (s.enum) return "enum";
  return Array.isArray(s.type) ? s.type[0] : s.type ?? "string";
}

function emptyFor(s: JsonSchema | undefined): unknown {
  if (!s) return "";
  switch (typeOf(s)) {
    case "enum": return s.enum![0];
    case "number": case "integer": return 0;
    case "boolean": return false;
    case "array": return [];
    case "object": return Object.fromEntries(Object.entries(s.properties ?? {}).map(([k, v]) => [k, emptyFor(v)]));
    default: return "";
  }
}

function setAt(root: unknown, path: Path, value: unknown): unknown {
  if (!path.length) return value;
  const [head, ...rest] = path;
  if (Array.isArray(root)) {
    const copy = root.slice();
    copy[head as number] = setAt(copy[head as number], rest, value);
    return copy;
  }
  const obj = (root ?? {}) as Record<string, unknown>;
  return { ...obj, [head]: setAt(obj[head as string], rest, value) };
}

function Field({ schema, value, path, label, onChange }: {
  schema: JsonSchema; value: unknown; path: Path; label?: string; onChange: (p: Path, v: unknown) => void;
}) {
  const id = `f-${path.join("-")}`;
  const t = typeOf(schema);
  const hint = schema.description ? <div className="faint" style={{ marginTop: -2, marginBottom: 4 }}>{schema.description}</div> : null;

  if (t === "object") {
    return (
      <div className={path.length ? "group" : ""}>
        {label && <h3 style={{ marginTop: 8 }}>{label}</h3>}
        {hint}
        {Object.entries(schema.properties ?? {}).map(([k, s]) => (
          <Field key={k} schema={s} value={(value as Record<string, unknown>)?.[k]} path={[...path, k]} label={humanize(k)} onChange={onChange} />
        ))}
      </div>
    );
  }

  if (t === "array") {
    const items = (Array.isArray(value) ? value : []) as unknown[];
    const itemSchema = schema.items ?? { type: "string" };
    const simple = typeOf(itemSchema) !== "object";
    return (
      <div className="field">
        {label && (path.length <= 1 ? <h2 style={{ marginTop: 20 }}>{label}</h2> : <label>{label}</label>)}
        {hint}
        {items.map((item, i) =>
          simple ? (
            <div key={i} className="arr-item inline">
              <div style={{ flex: 1 }}><Field schema={itemSchema} value={item} path={[...path, i]} onChange={onChange} /></div>
              <button type="button" className="small ghost" aria-label={`Remove item ${i + 1}`} onClick={() => onChange(path, items.filter((_, j) => j !== i))}>✕</button>
            </div>
          ) : (
            <div key={i} className="arr-item">
              <button type="button" className="small ghost remove" aria-label={`Remove item ${i + 1}`} onClick={() => onChange(path, items.filter((_, j) => j !== i))}>Remove</button>
              <Field schema={itemSchema} value={item} path={[...path, i]} onChange={onChange} />
            </div>
          ),
        )}
        <button type="button" className="small" onClick={() => onChange(path, [...items, emptyFor(itemSchema)])}>+ Add{label ? ` to ${label.toLowerCase()}` : ""}</button>
      </div>
    );
  }

  let control: React.ReactNode;
  if (t === "enum") {
    control = (
      <select id={id} value={String(value ?? "")} onChange={(e) => onChange(path, e.target.value)}>
        {schema.enum!.map((o) => <option key={o} value={o}>{humanize(o)}</option>)}
      </select>
    );
  } else if (t === "number" || t === "integer") {
    control = <input id={id} type="text" inputMode="decimal" value={String(value ?? "")} onChange={(e) => onChange(path, Number(e.target.value))} />;
  } else if (t === "boolean") {
    control = <input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(path, e.target.checked)} />;
  } else {
    const s = String(value ?? "");
    control = s.length > 70 || s.includes("\n")
      ? <textarea id={id} rows={Math.min(8, Math.ceil(s.length / 90) + 1)} value={s} onChange={(e) => onChange(path, e.target.value)} />
      : <input id={id} type="text" value={s} onChange={(e) => onChange(path, e.target.value)} />;
  }
  return (
    <div className="field">
      {label ? <label htmlFor={id}>{label}</label> : <label htmlFor={id} className="sr-only">Item</label>}
      {label && hint}
      {control}
    </div>
  );
}

export function SchemaEditor({ slug, stage, schema, initial, basedOn }: {
  slug: string; stage: string; schema: JsonSchema; initial: unknown; basedOn: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState<unknown>(initial);
  const [raw, setRaw] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setError("");
    let data = value;
    if (raw !== null) {
      try { data = JSON.parse(raw); } catch (e) { return setError(`That isn't valid JSON: ${(e as Error).message}`); }
    }
    setBusy(true);
    const res = await fetch(`/api/projects/${slug}/stages/${stage}/versions`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data, basedOn, note: note || undefined }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Could not save");
    router.push(`/p/${slug}/${stage}?v=${body.version}`);
    router.refresh();
  };

  return (
    <div className="editor stack">
      <div className="row">
        <span className="muted" style={{ flex: 1 }}>Editing version {basedOn}. Saving creates a new version; the old one stays in history.</span>
        <button type="button" className="small ghost" onClick={() => setRaw(raw === null ? JSON.stringify(value, null, 2) : null)}>
          {raw === null ? "Edit as JSON" : "Back to form"}
        </button>
      </div>
      {raw === null ? (
        <Field schema={schema} value={value} path={[]} onChange={(p, v) => setValue((cur: unknown) => setAt(cur, p, v))} />
      ) : (
        <>
          <label htmlFor="raw-json" className="sr-only">JSON</label>
          <textarea id="raw-json" className="mono" rows={30} value={raw} onChange={(e) => setRaw(e.target.value)} spellCheck={false} />
        </>
      )}
      <div className="card stack" style={{ position: "sticky", bottom: 12 }}>
        <div>
          <label htmlFor="note">What did you change? (optional, goes in the decision log)</label>
          <input id="note" type="text" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && <div className="notice bad" role="alert">{error}</div>}
        <div className="row">
          <button className="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save as new version"}</button>
          <button className="ghost" onClick={() => router.push(`/p/${slug}/${stage}?v=${basedOn}`)}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
