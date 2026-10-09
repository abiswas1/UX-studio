"use client";
import { useState } from "react";
import { WireframeFrame, blockNotes, type CopyLookup, type Device } from "@/components/Wireframe";
import type { Wireframes } from "./schema";

export function WireframesView({ data: w, lookup, platforms }: { data: Wireframes; lookup: CopyLookup; platforms: string[] }) {
  const mobilePlatforms = platforms.filter((p) => p === "ios" || p === "android") as Device[];
  const [screenIdx, setScreenIdx] = useState(0);
  const [device, setDevice] = useState<Device>(mobilePlatforms[0] ?? "desktop");
  const screen = w.screens[screenIdx];
  const frameDevice: Device = screen?.form === "desktop" ? "desktop" : device === "desktop" ? "ios" : device;

  return (
    <div className="artifact">
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="seg" role="tablist" aria-label="Screens">
          {w.screens.map((s, i) => (
            <button key={s.screenId} role="tab" aria-selected={i === screenIdx} className={i === screenIdx ? "active" : ""} onClick={() => setScreenIdx(i)}>
              {s.name}
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        {screen?.form === "mobile" && mobilePlatforms.length > 1 && (
          <div className="seg" role="group" aria-label="Device">
            {mobilePlatforms.map((d) => (
              <button key={d} aria-pressed={device === d} className={device === d ? "active" : ""} onClick={() => setDevice(d)}>
                {d === "ios" ? "iOS" : "Android"}
              </button>
            ))}
          </div>
        )}
      </div>

      {screen && (
        <div className="wf-strip">
          {screen.states.map((st) => {
            const notes = blockNotes(st.blocks);
            return (
              <figure key={st.state} className="wf-state">
                <figcaption><span className="badge">{st.state}</span></figcaption>
                <WireframeFrame blocks={st.blocks} lookup={lookup} device={frameDevice} />
                {(notes.length > 0 || st.notes) && (
                  <div className="wf-notes">
                    {st.notes && <p style={{ margin: "0 0 4px" }}>{st.notes}</p>}
                    {notes.length > 0 && <ol>{notes.map((n, i) => <li key={i}>{n}</li>)}</ol>}
                  </div>
                )}
              </figure>
            );
          })}
        </div>
      )}

      {w.annotations.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2>Notes for every screen</h2>
          <ul>{w.annotations.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </section>
      )}
      <section className="cols">
        {w.assumptions.length > 0 && <div><h2>Assumptions</h2><ul>{w.assumptions.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
        {w.openQuestions.length > 0 && <div><h2>Open questions</h2><ul>{w.openQuestions.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
      </section>
    </div>
  );
}
