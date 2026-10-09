import { Marked } from "marked";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Raw HTML in agent output is shown as text, never rendered.
const marked = new Marked({ gfm: true, renderer: { html: ({ text }) => esc(text) } });

/** Markdown to HTML for the report page. Mermaid fences become <pre class="mermaid-src"> for the client to draw. */
export function markdownToHtml(md: string): string {
  return (marked.parse(md, { async: false }) as string).replace(
    /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g,
    (_m, src) => `<pre class="mermaid-src">${src}</pre>`,
  );
}
