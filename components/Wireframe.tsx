"use client";
import type { WireBlock } from "@/agents/wireframer/schema";

// Grey-box renderer for the wireframe kit, inside an iOS, Android or desktop browser frame.

export type Device = "ios" | "android" | "desktop";

export interface CopyLookup {
  strings: Record<string, string>;
  errors: Record<string, string>;
}

const KEY_RE = /^[a-z0-9-]+\.[a-z0-9-.]+$/;

function resolve(lookup: CopyLookup, key: string, fallback = ""): { text: string; missing?: boolean } {
  if (!key) return { text: fallback };
  const found = lookup.strings[key] ?? lookup.errors[key];
  if (found !== undefined) return { text: found.includes("{") && fallback ? fallback : found };
  if (KEY_RE.test(key) || /^[a-z0-9]+(-[a-z0-9]+)+$/.test(key)) return { text: `⟨${key}⟩`, missing: true };
  return { text: key };
}

function T({ lookup, k, fallback }: { lookup: CopyLookup; k: string; fallback?: string }) {
  const r = resolve(lookup, k, fallback);
  return <span className={r.missing ? "wf-missing" : undefined} title={r.missing ? "Missing from the content deck" : k || undefined}>{r.text}</span>;
}

function Item({ lookup, value }: { lookup: CopyLookup; value: string }) {
  return KEY_RE.test(value) ? <T lookup={lookup} k={value} /> : <>{value}</>;
}

function BlockView({ b, lookup, device, marker }: { b: WireBlock | Omit<WireBlock, "children">; lookup: CopyLookup; device: Device; marker?: number }) {
  const label = <T lookup={lookup} k={b.copy} fallback={b.text} />;
  const mark = marker ? <span className="wf-marker" aria-label={`Note ${marker}`}>{marker}</span> : null;
  switch (b.type) {
    case "appbar":
      return (
        <div className={`wf-appbar ${device === "ios" ? "center" : ""}`}>
          {device !== "desktop" && <span className="wf-icon" aria-hidden />}
          <strong>{label}</strong>
          <span className="wf-appbar-actions">{b.items.map((i, n) => <span key={n} className="wf-icon" title={resolve(lookup, i).text} />)}</span>
          {mark}
        </div>
      );
    case "heading":
      return <div className="wf-heading">{label}{mark}</div>;
    case "text":
      return <p className="wf-text">{label}{mark}</p>;
    case "button":
      return <div className={`wf-button ${b.variant}`}>{label}{mark}</div>;
    case "input":
    case "select":
      return (
        <div className="wf-field">
          {b.copy && <div className="wf-label"><T lookup={lookup} k={b.copy} /></div>}
          <div className="wf-input">{b.text || " "}{b.type === "select" && <span aria-hidden>▾</span>}</div>
          {mark}
        </div>
      );
    case "toggle":
    case "checkbox":
      return (
        <div className="wf-toggle-row">
          <span>{label}</span>
          <span className={b.type === "toggle" ? "wf-switch" : "wf-check"} aria-hidden />
          {mark}
        </div>
      );
    case "list": {
      const rows = b.items.length ? b.items : Array.from({ length: b.count || 3 }, () => "");
      return (
        <div className="wf-list">
          {rows.map((r, i) => (
            <div key={i} className="wf-list-row">
              <span className="wf-dot" aria-hidden />
              {r ? <span><Item lookup={lookup} value={r} /></span> : <span className="wf-line" style={{ width: `${60 + ((i * 17) % 30)}%` }} />}
            </div>
          ))}
          {mark}
        </div>
      );
    }
    case "card":
      return (
        <div className="wf-card">
          {(b.copy || b.text) && <div className="wf-card-title">{label}</div>}
          {b.items.map((i, n) => <div key={n} className={n === 0 ? "wf-card-main" : "wf-card-sub"}><Item lookup={lookup} value={i} /></div>)}
          {mark}
        </div>
      );
    case "image":
      return <div className="wf-image"><span>{b.text || "Image"}</span>{mark}</div>;
    case "banner":
      return (
        <div className={`wf-banner ${b.variant}`}>
          <span className="wf-banner-icon" aria-hidden>{b.variant === "error" ? "!" : b.variant === "success" ? "✓" : b.variant === "warning" ? "!" : "i"}</span>
          <span>{label}</span>
          {mark}
        </div>
      );
    case "empty":
      return (
        <div className="wf-empty">
          <div className="wf-illustration" aria-hidden />
          <div className="wf-heading">{label}</div>
          {b.items.map((i, n) => <p key={n} className="wf-text"><Item lookup={lookup} value={i} /></p>)}
          {mark}
        </div>
      );
    case "spinner":
      return <div className="wf-spinner-wrap"><span className="wf-spinner" aria-hidden />{b.copy && <span className="faint"><T lookup={lookup} k={b.copy} /></span>}{mark}</div>;
    case "skeleton":
      return (
        <div className="wf-skeleton">
          {Array.from({ length: b.count || 4 }, (_, i) => <span key={i} className="wf-line" style={{ width: `${55 + ((i * 23) % 40)}%` }} />)}
          {mark}
        </div>
      );
    case "divider":
      return <hr className="wf-divider" />;
    case "tabbar":
      return (
        <div className="wf-tabbar">
          {b.items.map((i, n) => (
            <span key={n} className={n === 0 ? "active" : ""}><span className="wf-icon" aria-hidden /><Item lookup={lookup} value={i} /></span>
          ))}
        </div>
      );
    case "chips":
      return <div className="wf-chips">{b.items.map((i, n) => <span key={n} className={n === 0 ? "active" : ""}><Item lookup={lookup} value={i} /></span>)}{mark}</div>;
    case "table":
      return (
        <div className="wf-table">
          <div className="wf-tr head">{b.items.map((i, n) => <span key={n}><Item lookup={lookup} value={i} /></span>)}</div>
          {b.text.trim()
            ? b.text.split("\n").filter((l) => l.trim()).map((l, r) => <div key={r} className="wf-tr">{l.split(/\s*\|\s*/).slice(0, b.items.length).map((c, n) => <span key={n}>{c}</span>)}</div>)
            : Array.from({ length: b.count || 5 }, (_, r) => (
              <div key={r} className="wf-tr">{b.items.map((_, n) => <span key={n}><span className="wf-line" style={{ width: `${40 + ((r * 13 + n * 29) % 50)}%` }} /></span>)}</div>
            ))}
          {mark}
        </div>
      );
    case "sidebar":
      return null; // drawn by the frame
    case "stat":
      return (
        <div className="wf-stat">
          <div className="wf-label"><T lookup={lookup} k={b.copy} /></div>
          <div className="wf-stat-value">{b.text || "—"}</div>
          {mark}
        </div>
      );
    case "row":
      return (
        <div className="wf-row">
          {"children" in b && b.children.map((c, i) => <BlockView key={i} b={c} lookup={lookup} device={device} />)}
          {mark}
        </div>
      );
    default:
      return null;
  }
}

/** Numbered notes for blocks that carry an annotation. */
export function blockNotes(blocks: WireBlock[]): string[] {
  return blocks.filter((b) => b.note).map((b) => b.note);
}

export function WireframeFrame({ blocks, lookup, device }: { blocks: WireBlock[]; lookup: CopyLookup; device: Device }) {
  const tabbar = blocks.filter((b) => b.type === "tabbar");
  const sidebar = blocks.find((b) => b.type === "sidebar");
  const body = blocks.filter((b) => b.type !== "tabbar" && b.type !== "sidebar");
  let n = 0;
  const markers = new Map<WireBlock, number>();
  for (const b of blocks) if (b.note) markers.set(b, ++n);

  if (device === "desktop") {
    return (
      <div className="wf-frame desktop">
        <div className="wf-browser-bar" aria-hidden><span /><span /><span /><div className="wf-url" /></div>
        <div className="wf-desktop-body">
          {sidebar && (
            <nav className="wf-sidebar">
              {sidebar.items.map((i, k) => <div key={k} className={k === 0 ? "active" : ""}><Item lookup={lookup} value={i} /></div>)}
            </nav>
          )}
          <div className="wf-content">{body.map((b, i) => <BlockView key={i} b={b} lookup={lookup} device={device} marker={markers.get(b)} />)}</div>
        </div>
      </div>
    );
  }
  return (
    <div className={`wf-frame ${device}`}>
      <div className="wf-status" aria-hidden>
        <span>9:41</span>
        {device === "ios" && <span className="wf-notch" />}
        <span className="wf-status-icons" />
      </div>
      <div className="wf-content">{body.map((b, i) => <BlockView key={i} b={b} lookup={lookup} device={device} marker={markers.get(b)} />)}</div>
      {tabbar.map((b, i) => <BlockView key={i} b={b} lookup={lookup} device={device} />)}
      <div className={device === "ios" ? "wf-home" : "wf-navbar"} aria-hidden><span /></div>
    </div>
  );
}
