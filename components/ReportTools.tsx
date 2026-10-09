"use client";
import { useEffect } from "react";
import { useHotkeys } from "./useHotkeys";

/** Draws the report's Mermaid diagrams and offers print / save as PDF. */
export function ReportTools({ slug }: { slug: string }) {
  useHotkeys({ p: () => window.print() });
  useEffect(() => {
    (async () => {
      const blocks = Array.from(document.querySelectorAll<HTMLPreElement>("pre.mermaid-src"));
      if (!blocks.length) return;
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "strict", fontFamily: "inherit" });
      for (const [i, pre] of blocks.entries()) {
        try {
          const { svg } = await mermaid.render(`report-m${i}`, pre.textContent ?? "");
          const div = document.createElement("div");
          div.className = "diagram";
          div.setAttribute("role", "img");
          div.setAttribute("aria-label", "Flow diagram");
          div.innerHTML = svg;
          pre.replaceWith(div);
        } catch {
          pre.classList.add("live");
        }
      }
    })();
  }, []);

  return (
    <div className="report-tools no-print">
      <button className="btn primary" onClick={() => window.print()}>Save as PDF <kbd>p</kbd></button>
      <a className="btn" href={`/api/projects/${slug}/report`}>Download Markdown</a>
      <span className="faint">In the print dialog, choose “Save as PDF”.</span>
    </div>
  );
}
