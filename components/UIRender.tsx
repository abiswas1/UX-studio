// React is imported explicitly so this renders outside Next.js too (prototype builds in scripts and tests).
import * as React from "react";
import type { CSSProperties } from "react";
import type { UIBlockT } from "@/agents/ui/schema";
import type { Theme } from "@/agents/design-system/schema";
import type { CopyLookup } from "./Wireframe";
import { Icon, tabIcon } from "./Icon";

// Renders high-fidelity screens from the UI spec, themed by the design system. Pure (no hooks),
// so it renders in the app and, server-side, into the static HTML prototype.
// Platform styling follows each platform's conventions: iOS (large titles, inset grouped lists,
// sheets), Android/Material (top app bar, pill buttons, navigation bar) and web.

export type Platform = "ios" | "android" | "web";
export type Mode = "light" | "dark";

const KEY_RE = /^[a-z0-9-]+\.[a-z0-9-.]+$/;

function text(lookup: CopyLookup, key: string, fallback = ""): string {
  if (!key) return fallback;
  const v = lookup.strings[key] ?? lookup.errors[key];
  if (v === undefined) return KEY_RE.test(key) ? `⟨${key}⟩` : key;
  if (!v.includes("{")) return v;
  // Placeholders: use the block's sample text when it has one; counts read as "1" in mockups.
  return fallback || v.replace(/\{(count|n|number)\}/g, "1");
}
const item = (lookup: CopyLookup, v: string) => (KEY_RE.test(v) ? text(lookup, v) : v.replace(/\{(count|n|number)\}/g, "1"));

export function themeVars(theme: Theme, mode: Mode): CSSProperties {
  const p = theme.color[mode];
  const t = theme.type;
  return {
    "--c-bg": p.background, "--c-surface": p.surface, "--c-surface-alt": p.surfaceAlt, "--c-text": p.text, "--c-muted": p.textMuted,
    "--c-primary": p.primary, "--c-on-primary": p.onPrimary, "--c-primary-container": p.primaryContainer, "--c-on-primary-container": p.onPrimaryContainer,
    "--c-border": p.border, "--c-danger": p.danger, "--c-on-danger": p.onDanger, "--c-danger-container": p.dangerContainer,
    "--c-on-danger-container": p.onDangerContainer, "--c-success": p.success, "--c-warning": p.warning, "--c-focus": p.focus,
    "--r-sm": `${theme.radius.sm}px`, "--r-md": `${theme.radius.md}px`, "--r-lg": `${theme.radius.lg}px`, "--r-full": `${theme.radius.full}px`,
    "--target": `${theme.minTarget}px`,
    "--f": `${theme.fontFamily}, ${theme.fallbackFont}`,
    "--t-display": `${t.display.weight} ${t.display.size}px/${t.display.lineHeight}px var(--f)`,
    "--t-headline": `${t.headline.weight} ${t.headline.size}px/${t.headline.lineHeight}px var(--f)`,
    "--t-title": `${t.title.weight} ${t.title.size}px/${t.title.lineHeight}px var(--f)`,
    "--t-body": `${t.body.weight} ${t.body.size}px/${t.body.lineHeight}px var(--f)`,
    "--t-label": `${t.label.weight} ${t.label.size}px/${t.label.lineHeight}px var(--f)`,
    "--t-caption": `${t.caption.weight} ${t.caption.size}px/${t.caption.lineHeight}px var(--f)`,
  } as CSSProperties;
}

function splitRow(s: string): [string, string] {
  const i = s.indexOf(" · ");
  return i === -1 ? [s, ""] : [s.slice(0, i), s.slice(i + 3)];
}

function statusIcon(sub: string): { name: string; tone: string } | null {
  if (/taken/i.test(sub)) return { name: "check", tone: "var(--c-success)" };
  if (/due/i.test(sub)) return { name: "clock", tone: "var(--c-primary)" };
  if (/not marked|skipped/i.test(sub)) return { name: "info", tone: "var(--c-muted)" };
  return null;
}

export function UIBlockView({ b, lookup, platform, forceState, activeTab }: { b: UIBlockT | Omit<UIBlockT, "children">; lookup: CopyLookup; platform: Platform; forceState?: string; activeTab?: string }) {
  const label = text(lookup, b.copy, b.text);
  const state = forceState ?? b.state;
  const st = `ui-state-${state}`;
  switch (b.type) {
    case "appbar":
      return platform === "ios" ? (
        <div className="ui-appbar ios">
          <div className="ui-appbar-row">
            <span />
            <span className="ui-appbar-actions">{b.items.map((i, n) => <span key={n} className="ui-icon-btn" role="button" aria-label={item(lookup, i)} data-copy={i}><Icon name={b.icon !== "none" ? b.icon : "plus"} size={22} /></span>)}</span>
          </div>
          <div className="ui-large-title">{label}</div>
        </div>
      ) : (
        <div className={`ui-appbar ${platform}`}>
          <span className="ui-appbar-title">{label}</span>
          <span className="ui-appbar-actions">{b.items.map((i, n) => <span key={n} className="ui-icon-btn" role="button" aria-label={item(lookup, i)} data-copy={i}><Icon name={b.icon !== "none" ? b.icon : "plus"} size={22} /></span>)}</span>
        </div>
      );
    case "heading":
      return <div className={`ui-heading ${b.emphasis}`}>{label}</div>;
    case "text":
      return <p className={`ui-text ${b.emphasis}`}>{label}</p>;
    case "button":
      return (
        <div className={`ui-button ${b.variant === "none" ? "secondary" : b.variant} ${platform} ${st}`} role="button" aria-disabled={state === "disabled" || undefined}>
          {state === "loading" ? <span className="ui-spinner small" /> : b.icon !== "none" && <Icon name={b.icon} size={18} />}
          {label && <span>{label}</span>}
        </div>
      );
    case "input":
    case "select":
      return (
        <div className={`ui-field ${platform} ${st}`}>
          {b.copy && <div className="ui-label">{text(lookup, b.copy)}</div>}
          <div className="ui-input">
            {b.icon !== "none" && <Icon name={b.icon} size={18} />}
            <span className={b.text ? "" : "placeholder"}>{b.text || " "}</span>
            {b.type === "select" && <Icon name="chevron-right" size={16} />}
          </div>
          {state === "error" && b.note && <div className="ui-helper error">{text(lookup, b.note.replace(/^Error: /, ""))}</div>}
        </div>
      );
    case "toggle":
    case "checkbox":
      return (
        <div className={`ui-toggle-row ${st}`}>
          <span>{label}</span>
          <span className={b.type === "toggle" ? `ui-switch ${platform}` : "ui-check"} data-on={state === "selected"} />
        </div>
      );
    case "list": {
      const rows = b.items.length ? b.items : Array.from({ length: b.count || 3 }, (_, i) => `Item ${i + 1}`);
      return (
        <div className={`ui-list ${platform}`}>
          {rows.map((r, i) => {
            const [title, sub] = splitRow(item(lookup, r));
            const s = statusIcon(sub);
            return (
              <div key={i} className="ui-row" data-copy={r}>
                <span className="ui-row-lead" style={{ color: s?.tone ?? "var(--c-primary)" }}><Icon name={s?.name ?? (b.icon !== "none" ? b.icon : "pill")} size={20} /></span>
                <span className="ui-row-text"><span>{title}</span>{sub && <span className="ui-row-sub">{sub}</span>}</span>
                <Icon name="chevron-right" size={16} />
              </div>
            );
          })}
        </div>
      );
    }
    case "card":
      return (
        <div className={`ui-card ${b.emphasis === "strong" ? "strong" : ""}`}>
          {b.icon !== "none" && <span className="ui-card-icon"><Icon name={b.icon} size={22} /></span>}
          <div>
            {(b.copy || b.text) && <div className="ui-card-title">{label}</div>}
            {b.items.map((i, n) => <div key={n} className={n === 0 ? "ui-card-main" : "ui-card-sub"}>{item(lookup, i)}</div>)}
          </div>
        </div>
      );
    case "image":
      return <div className="ui-image">{b.text || "Image"}</div>;
    case "banner":
      return (
        <div className={`ui-banner ${b.variant}`} role={b.variant === "error" ? "alert" : "status"}>
          <Icon name={b.icon !== "none" ? b.icon : b.variant === "error" ? "error" : b.variant === "warning" ? "wifi-off" : b.variant === "success" ? "check" : "info"} size={20} />
          <span>{label}</span>
        </div>
      );
    case "empty":
      return (
        <div className="ui-empty">
          <span className="ui-empty-art"><Icon name={b.icon !== "none" ? b.icon : "pill"} size={36} strokeWidth={1.5} /></span>
          <div className="ui-heading">{label}</div>
          {b.items.map((i, n) => <p key={n} className="ui-text muted">{item(lookup, i)}</p>)}
        </div>
      );
    case "spinner":
      return <div className="ui-spinner-wrap"><span className="ui-spinner" />{b.copy && <span className="sr-only">{text(lookup, b.copy)}</span>}</div>;
    case "skeleton":
      return (
        <div className="ui-skeleton" aria-busy="true">
          {Array.from({ length: b.count || 4 }, (_, i) => <span key={i} style={{ width: `${55 + ((i * 23) % 40)}%` }} />)}
        </div>
      );
    case "divider":
      return <hr className="ui-divider" />;
    case "tabbar":
      return (
        <nav className={`ui-tabbar ${platform}`}>
          {b.items.map((i, n) => {
            const l = item(lookup, i);
            // The tab named like the current screen is active; otherwise the first.
            const match = activeTab ? b.items.findIndex((x) => item(lookup, x).toLowerCase() === activeTab.toLowerCase()) : -1;
            return (
              <span key={n} className={n === (match === -1 ? 0 : match) ? "active" : ""} data-copy={i}>
                <span className="ui-tab-icon"><Icon name={tabIcon(l)} size={22} /></span>
                {l}
              </span>
            );
          })}
        </nav>
      );
    case "chips":
      return <div className={`ui-chips ${platform}`}>{b.items.map((i, n) => <span key={n} className={n === 0 ? "selected" : ""} data-copy={i}>{n === 0 && <Icon name="check" size={14} />}{item(lookup, i)}</span>)}</div>;
    case "table":
      return (
        <div className="ui-table">
          <div className="ui-tr head">{b.items.map((i, n) => <span key={n}>{item(lookup, i)}</span>)}</div>
          {Array.from({ length: b.count || 5 }, (_, r) => <div key={r} className="ui-tr">{b.items.map((_, n) => <span key={n} className="ui-skel-cell" />)}</div>)}
        </div>
      );
    case "stat":
      return <div className="ui-stat"><div className="ui-label">{text(lookup, b.copy)}</div><div className="ui-stat-value">{b.text}</div></div>;
    case "row":
      return <div className="ui-hrow">{"children" in b && b.children.map((c, i) => <UIBlockView key={i} b={c} lookup={lookup} platform={platform} />)}</div>;
    default:
      return null;
  }
}

export function UIScreen({ blocks, lookup, theme, mode, platform, presentation, screenName }: {
  blocks: UIBlockT[]; lookup: CopyLookup; theme: Theme; mode: Mode; platform: Platform; presentation: "full" | "sheet" | "modal"; screenName?: string;
}) {
  const tabbar = blocks.filter((b) => b.type === "tabbar");
  const body = blocks.filter((b) => b.type !== "tabbar" && b.type !== "sidebar");
  const sidebar = blocks.find((b) => b.type === "sidebar");
  // display:contents wrappers carry the block's content key for prototype hotspots without affecting layout.
  const content = body.map((b, i) => (
    <div key={i} style={{ display: "contents" }} data-copy={b.copy || undefined}>
      <UIBlockView b={b} lookup={lookup} platform={platform} />
    </div>
  ));
  const device = platform === "web" ? "desktop" : platform;
  // On the web, the app's tabs become side navigation, and forms and reading screens get a
  // comfortable column; dashboards (tables, stats) use the full width.
  const navItems = (sidebar ?? tabbar[0])?.items ?? [];
  const activeNav = screenName ? navItems.findIndex((x) => item(lookup, x).toLowerCase() === screenName.toLowerCase()) : -1;
  const dense = (b: UIBlockT): boolean => b.type === "table" || b.type === "stat" || ("children" in b && (b.children as UIBlockT[]).some(dense));
  const wide = body.some(dense);

  return (
    <div className={`ui-frame ${device} ui-${platform} mode-${mode}`} style={themeVars(theme, mode)}>
      {platform === "web" ? (
        presentation !== "full" ? (
          // Sheets and modals become a centred dialog on the web.
          <div className="ui-web-dialog-wrap">
            <div className="ui-sheet-backdrop" />
            <div className="ui-web-dialog" role="dialog"><div className="ui-content">{content}</div></div>
          </div>
        ) : (
          <div className="ui-web">
            {navItems.length > 0 && (
              <nav className="ui-sidebar">
                {navItems.map((i, n) => (
                  <span key={n} className={n === (activeNav === -1 ? 0 : activeNav) ? "active" : ""} data-copy={KEY_RE.test(i) ? i : undefined}>
                    <Icon name={tabIcon(item(lookup, i))} size={18} />{item(lookup, i)}
                  </span>
                ))}
              </nav>
            )}
            <div className={`ui-content ${wide ? "" : "narrow"}`}>{content}</div>
          </div>
        )
      ) : (
        <>
          <div className="ui-status"><span>9:41</span>{platform === "ios" && <span className="ui-notch" />}<span className="ui-status-icons" /></div>
          {presentation === "sheet" ? (
            <div className="ui-sheet-wrap">
              <div className="ui-sheet-backdrop" />
              <div className={`ui-sheet ${platform}`}>
                <span className="ui-grabber" />
                <div className="ui-content">{content}</div>
              </div>
            </div>
          ) : (
            <>
              <div className="ui-content">{content}</div>
              {tabbar.map((b, i) => <UIBlockView key={i} b={b} lookup={lookup} platform={platform} activeTab={screenName} />)}
            </>
          )}
          <div className="ui-home"><span /></div>
        </>
      )}
    </div>
  );
}
