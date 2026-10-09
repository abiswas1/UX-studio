// Mermaid adjustments for Figma's generate_diagram: quoted labels, camelCase-safe node ids,
// no reserved words as ids, no HTML or escaped newlines.
const RESERVED = new Set(["end", "subgraph", "graph", "flowchart", "style", "class"]);

export function toFigjamMermaid(source: string): string {
  const lines = source.trim().split("\n");
  const ids = new Map<string, string>();
  const safeId = (id: string) => {
    if (!ids.has(id)) {
      let s = id.replace(/_+([a-z0-9])/gi, (_, c: string) => c.toUpperCase()).replace(/[^A-Za-z0-9]/g, "");
      if (!s || RESERVED.has(s.toLowerCase()) || /^\d/.test(s)) s = `n${s}`;
      ids.set(id, s);
    }
    return ids.get(id)!;
  };
  const quote = (t: string) => `"${t.trim().replace(/^"|"$/g, "").replace(/"/g, "'").replace(/<[^>]+>/g, "").replace(/\\n/g, " ")}"`;
  return lines
    .map((line, i) => {
      if (i === 0) return line.trim();
      return line
        // edge labels: -->|text| or -- text -->
        .replace(/\|([^|]+)\|/g, (_, t: string) => `|${quote(t)}|`)
        // node shapes: id[..], id{..}, id(..), id([..]), id[[..]]
        .replace(/\b([A-Za-z_][\w]*)\s*(\[\[|\(\[|\[|\{|\(\(|\()([^\]\})]*?)(\]\]|\]\)|\]|\}|\)\)|\))/g,
          (_, id: string, open: string, text: string, close: string) => `${safeId(id)}${open}${quote(text)}${close}`)
        // bare ids around arrows
        .replace(/(^|\s|>|\|)([A-Za-z_][\w]*)(?=\s*(-->|---|-\.->|==>|$|\s*\|))/g, (m, pre: string, id: string) =>
          RESERVED.has(id) && pre === "" ? m : `${pre}${safeId(id)}`);
    })
    .join("\n");
}
