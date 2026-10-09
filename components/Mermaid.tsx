"use client";
import { useEffect, useId, useState } from "react";

/** Renders a Mermaid diagram in the browser; shows the source if it can't be drawn. */
export function Mermaid({ source, label }: { source: string; label: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "neutral", securityLevel: "strict", fontFamily: "inherit" });
        const { svg } = await mermaid.render(`m${id}`, source);
        if (!cancelled) setSvg(svg);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, source]);

  if (error) {
    return (
      <div>
        <div className="notice bad">This diagram couldn't be drawn: {error.split("\n")[0]}</div>
        <pre className="live">{source}</pre>
      </div>
    );
  }
  return (
    <figure style={{ margin: 0 }}>
      <figcaption className="sr-only">{label}</figcaption>
      {svg ? (
        <div className="diagram" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="faint">Drawing diagram…</div>
      )}
    </figure>
  );
}
