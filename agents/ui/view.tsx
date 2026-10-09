"use client";
import { useMemo, useState } from "react";
import { UIBlockView, UIScreen, isWideScreen, themeVars, type Mode, type Platform } from "@/components/UIRender";
import type { CopyLookup } from "@/components/Wireframe";
import type { DesignSystem } from "../design-system/schema";
import type { UI, UIBlockT } from "./schema";

const NAMES: Record<string, string> = { ios: "iOS", android: "Android", web: "Web" };

function exampleBlock(ui: UI, component: string): UIBlockT | null {
  const [type, variant] = component.split("/");
  for (const s of ui.screens) for (const st of s.states) for (const b of st.blocks.flatMap((x) => [x, ...(x.children as UIBlockT[])])) {
    if (b.type === type && (!variant || b.variant === variant || (variant === "secondary" && b.variant === "none"))) return { ...b, state: "default" } as UIBlockT;
  }
  return null;
}

export function UIView({ data: ui, lookup, designSystem, platforms }: { data: UI; lookup: CopyLookup; designSystem: DesignSystem | null; platforms: string[] }) {
  const available = (designSystem?.themes.map((t) => t.platform) ?? []).filter((p) => platforms.includes(p)) as Platform[];
  const [platform, setPlatform] = useState<Platform>(available[0] ?? "ios");
  const [mode, setMode] = useState<Mode>("light");
  const [screenIdx, setScreenIdx] = useState(0);
  const theme = designSystem?.themes.find((t) => t.platform === platform);
  const screen = ui.screens[screenIdx];

  const samples = useMemo(() => ui.componentStates.map((c) => ({ ...c, block: exampleBlock(ui, c.component) })), [ui]);

  if (!theme) return <div className="notice warn">This UI was built without a design system theme for these platforms, so it can&apos;t be previewed.</div>;

  return (
    <div className="artifact">
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="seg" role="tablist" aria-label="Screens">
          {ui.screens.map((s, i) => (
            <button key={s.screenId} role="tab" aria-selected={i === screenIdx} className={i === screenIdx ? "active" : ""} onClick={() => setScreenIdx(i)}>{s.name}</button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        {available.length > 1 && (
          <div className="seg" role="group" aria-label="Platform">
            {available.map((p) => <button key={p} aria-pressed={platform === p} className={platform === p ? "active" : ""} onClick={() => setPlatform(p)}>{NAMES[p]}</button>)}
          </div>
        )}
        <div className="seg" role="group" aria-label="Appearance">
          {(["light", "dark"] as const).map((m) => <button key={m} aria-pressed={mode === m} className={mode === m ? "active" : ""} onClick={() => setMode(m)}>{m === "light" ? "Light" : "Dark"}</button>)}
        </div>
      </div>

      {screen && (
        <div className="wf-strip">
          {screen.states.map((st) => (
            <figure key={st.state} className="wf-state">
              <figcaption><span className="badge">{st.state}</span>{screen.presentation !== "full" && <span className="faint"> · {screen.presentation}</span>}</figcaption>
              <UIScreen blocks={st.blocks} lookup={lookup} theme={theme} mode={mode} platform={platform} presentation={screen.presentation} screenName={screen.name} wide={isWideScreen(screen.states)} />
              {st.notes && <div className="wf-notes">{st.notes}</div>}
            </figure>
          ))}
        </div>
      )}

      <section style={{ marginTop: 24 }}>
        <h2>Component states · {NAMES[platform]} · {mode}</h2>
        <div className={`ui-states ui-${platform} mode-${mode}`} style={themeVars(theme, mode)}>
          {samples.map((c) => (
            <div key={c.component} className="ui-states-row">
              <div className="ui-states-name">{c.component}</div>
              <div className="ui-states-cells">
                {c.states.map((s) => (
                  <div key={s.state} className="ui-states-cell">
                    {c.block ? <UIBlockView b={c.block} lookup={lookup} platform={platform} forceState={s.state} /> : <span className="faint">—</span>}
                    <div className="ui-states-caption"><strong>{s.state}</strong> {s.spec}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {ui.motion.length > 0 && <section><h2>Motion</h2><ul>{ui.motion.map((m, i) => <li key={i}>{m}</li>)}</ul></section>}
      <section className="cols">
        {ui.assumptions.length > 0 && <div><h2>Assumptions</h2><ul>{ui.assumptions.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
        {ui.openQuestions.length > 0 && <div><h2>Open questions</h2><ul>{ui.openQuestions.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
      </section>
    </div>
  );
}
