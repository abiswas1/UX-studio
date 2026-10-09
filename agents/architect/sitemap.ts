import type { Architecture } from "./schema";

export function sitemapMermaid(a: Architecture): string {
  const name = (id: string) => a.screens.find((s) => s.id === id)?.name.replace(/["[\]]/g, "") ?? id;
  const lines = ["flowchart TD"];
  for (const m of a.sitemap) {
    lines.push(`  ${m.screenId.replace(/-/g, "_")}["${name(m.screenId)}"]`);
    if (m.parent) lines.push(`  ${m.parent.replace(/-/g, "_")} -->|${m.navigation}| ${m.screenId.replace(/-/g, "_")}`);
  }
  return lines.join("\n");
}
