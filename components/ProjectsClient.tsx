"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useHotkeys } from "./useHotkeys";
import type { StageStatus } from "@/lib/orchestrator/status";

interface Row { slug: string; name: string; platforms: string[]; updatedAt: string; stages: StageStatus[] }
interface Sample { id: string; name: string; platforms: string[]; brief: string }

const PLATFORMS = [
  ["web", "Web"],
  ["ios", "iOS"],
  ["android", "Android"],
] as const;

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function ProjectsClient({ projects, samples }: { projects: Row[]; samples: Sample[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(projects.length === 0);
  const [sel, setSel] = useState(0);
  const [form, setForm] = useState({ name: "", brief: "", platforms: ["web"] as string[], mode: "approve", sampleId: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useHotkeys({
    n: () => { setCreating(true); setTimeout(() => nameRef.current?.focus(), 0); },
    j: () => setSel((s) => Math.min(projects.length - 1, s + 1)),
    k: () => setSel((s) => Math.max(0, s - 1)),
    Enter: () => projects[sel] && router.push(`/p/${projects[sel].slug}`),
  });

  const useSample = (s: Sample) => {
    setCreating(true);
    setForm({ name: s.name, brief: s.brief, platforms: s.platforms, mode: "approve", sampleId: s.id });
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Something went wrong");
    router.push(`/p/${body.slug}`);
  };

  const togglePlatform = (p: string) =>
    setForm((f) => ({ ...f, platforms: f.platforms.includes(p) ? f.platforms.filter((x) => x !== p) : [...f.platforms, p] }));

  return (
    <div className="stack">
      <div className="row">
        <h1 style={{ margin: 0 }}>Projects</h1>
        <span className="spacer" style={{ flex: 1 }} />
        {!creating && <button className="primary" onClick={() => setCreating(true)}>New project <kbd>n</kbd></button>}
      </div>

      {creating && (
        <form className="card stack" onSubmit={create}>
          <h2 style={{ margin: 0 }}>New project</h2>
          <div>
            <label htmlFor="name">Name</label>
            <input id="name" ref={nameRef} type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Medication reminders" />
          </div>
          <div>
            <label htmlFor="brief">Brief</label>
            <textarea id="brief" required rows={9} value={form.brief} onChange={(e) => setForm({ ...form, brief: e.target.value, sampleId: "" })}
              placeholder="Describe the product or feature: who it's for, the problem, what the first release must do, and any constraints." />
            <p className="faint" style={{ marginTop: 4 }}>You can attach research files (PDFs, images, CSVs, transcripts) on the next screen.</p>
          </div>
          <fieldset>
            <legend>Platforms</legend>
            <div className="checks">
              {PLATFORMS.map(([id, label]) => (
                <label key={id}><input type="checkbox" checked={form.platforms.includes(id)} onChange={() => togglePlatform(id)} /> {label}</label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>How should the team work?</legend>
            <div className="checks">
              <label><input type="radio" name="mode" checked={form.mode === "approve"} onChange={() => setForm({ ...form, mode: "approve" })} /> Stop for my review after each stage</label>
              <label><input type="radio" name="mode" checked={form.mode === "unattended"} onChange={() => setForm({ ...form, mode: "unattended" })} /> Run on its own</label>
            </div>
          </fieldset>
          {error && <div className="notice bad">{error}</div>}
          <div className="row">
            <button className="primary" disabled={busy || !form.platforms.length}>{busy ? "Creating…" : "Create project"}</button>
            {projects.length > 0 && <button type="button" className="ghost" onClick={() => setCreating(false)}>Cancel</button>}
          </div>
          <div>
            <p className="faint" style={{ marginBottom: 6 }}>Or start from a sample brief:</p>
            <div className="row">
              {samples.map((s) => (
                <button type="button" className="small" key={s.id} onClick={() => useSample(s)}>{s.name}</button>
              ))}
            </div>
          </div>
        </form>
      )}

      {projects.length > 0 ? (
        <div className="card" style={{ padding: 0 }}>
          {projects.map((p, i) => (
            <Link key={p.slug} href={`/p/${p.slug}`} className={`list-row${i === sel ? " active" : ""}`}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div className="faint">{p.platforms.join(" · ")} · updated {when(p.updatedAt)}</div>
              </div>
              <div className="dots" aria-label="Stage progress">
                {p.stages.map((s, j) => (
                  <span key={j} className={s === "approved" ? "done" : s === "needs_review" ? "review" : s === "stale" ? "stale" : ""} />
                ))}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        !creating && <div className="empty">No projects yet.</div>
      )}
    </div>
  );
}
