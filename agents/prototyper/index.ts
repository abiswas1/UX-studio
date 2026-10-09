import type { AgentModule } from "../../lib/agents/types";
import { checklist, list, stageTask } from "../../lib/agents/helpers";
import type { UI, UIBlockT } from "../ui/schema";
import type { Architecture } from "../architect/schema";
import type { Critique } from "../critic/schema";
import { PrototypeSchema, type Prototype } from "./schema";
import { buildPrototypeFiles } from "../../lib/prototype/build";

const flat = (blocks: UIBlockT[]) => blocks.flatMap((b) => [b, ...(b.children as UIBlockT[])]);

/** Every content key a person can tap in a screen state. */
export function tappable(ui: UI, screenId: string, state: string): Set<string> {
  const s = ui.screens.find((x) => x.screenId === screenId);
  const keys = new Set<string>();
  for (const st of s?.states ?? []) {
    if (state !== "*" && st.state !== state) continue;
    for (const b of flat(st.blocks)) {
      if (b.copy) keys.add(b.copy);
      for (const i of b.items) keys.add(i);
    }
  }
  return keys;
}

export function prototypeDod(p: Prototype, deps: { ui?: UI; arch?: Architecture; critique?: Critique }) {
  const k = checklist();
  const ui = deps.ui;
  if (ui) {
    const has = (screenId: string, state: string) => ui.screens.some((s) => s.screenId === screenId && (state === "*" || s.states.some((st) => st.state === state)));
    k.add("entry", "The prototype starts on a real screen", has(p.entry.screenId, p.entry.state), `${p.entry.screenId}/${p.entry.state} doesn't exist.`);

    const badEnds = p.links.filter((l) => !has(l.from.screenId, l.from.state) || !has(l.to.screenId, l.to.state) || l.to.state === "*");
    k.add("link-targets", "Every link starts and ends on a real screen state", badEnds.length === 0,
      badEnds.slice(0, 5).map((l) => `${l.from.screenId}/${l.from.state} → ${l.to.screenId}/${l.to.state}`).join(", "));

    const badEls = p.links.filter((l) => l.trigger === "tap" && !tappable(ui, l.from.screenId, l.from.state).has(l.element));
    k.add("link-elements", "Every tap link points at an element on its screen", badEls.length === 0,
      badEls.slice(0, 5).map((l) => `${l.from.screenId}/${l.from.state}: ${l.element}`).join(", "));

    // Reachability from the entry state.
    const seen = new Set<string>([`${p.entry.screenId}/${p.entry.state}`]);
    const queue = [...seen];
    while (queue.length) {
      const [screenId, state] = queue.shift()!.split("/");
      for (const l of p.links) {
        if (l.from.screenId !== screenId || (l.from.state !== "*" && l.from.state !== state)) continue;
        const key = `${l.to.screenId}/${l.to.state}`;
        if (!seen.has(key)) { seen.add(key); queue.push(key); }
      }
    }
    const p0 = deps.arch?.screens.filter((s) => s.priority === "P0").map((s) => s.id) ?? ui.screens.map((s) => s.screenId);
    const unreachable = p0.filter((id) => ui.screens.some((s) => s.screenId === id) && ![...seen].some((x) => x.startsWith(`${id}/`)));
    k.add("reachable", "Every P0 screen can be reached by clicking from the start", unreachable.length === 0, `Unreachable: ${unreachable.join(", ")}.`);

    const deadPrimary: string[] = [];
    for (const s of ui.screens) for (const st of s.states) {
      if (st.state === "loading") continue;
      for (const b of flat(st.blocks).filter((x) => x.type === "button" && x.variant === "primary")) {
        const linked = p.links.some((l) => l.from.screenId === s.screenId && (l.from.state === st.state || l.from.state === "*") && l.element === b.copy);
        const excused = p.staticActions.some((a) => a.screenId === s.screenId && a.state === st.state && a.element === b.copy);
        if (!linked && !excused) deadPrimary.push(`${s.screenId}/${st.state}: ${b.copy}`);
      }
    }
    k.add("primary-links", "Every primary action goes somewhere (or says why not)", deadPrimary.length === 0, deadPrimary.slice(0, 6).join("; "));

    const undocumented = ui.screens.filter((s) => !p.handoff.screens.some((h) => h.screenId === s.screenId)).map((s) => s.screenId);
    k.add("handoff", "The handoff spec covers every screen", undocumented.length === 0, `Missing: ${undocumented.join(", ")}.`);
  }
  if (deps.critique) {
    const open = deps.critique.findings.filter((f) => f.severity >= 3).map((f) => f.id);
    const missing = open.filter((id) => !p.handoff.openIssues.some((o) => o.findingId === id));
    k.add("open-issues", "Unresolved serious critique findings are listed in the handoff", missing.length === 0, `Not listed: ${missing.join(", ")}.`);
  }
  return k.result();
}

function toMarkdown(p: Prototype): string {
  const h = p.handoff;
  const out = ["# Handoff", "", h.overview, "", `Prototype: exports/prototype/index.html (starts on ${p.entry.screenId}/${p.entry.state}).`, ""];
  for (const s of h.screens) {
    out.push(`## ${s.screenId}`, "", s.purpose, "", "**Behaviour**", "", list(s.behaviour), "");
    if (s.data.length) out.push("**Data**", "", list(s.data), "");
    if (s.edgeCases.length) out.push("**Edge cases**", "", list(s.edgeCases), "");
    out.push("**Acceptance criteria**", "", ...s.acceptanceCriteria.map((c) => `- [ ] ${c}`), "");
  }
  out.push("## Components", "", ...h.components.map((c) => `- **${c.name}**: ${c.notes}`), "");
  out.push("## Accessibility", "", list(h.accessibility), "");
  if (h.analytics.length) out.push("## Analytics", "", list(h.analytics), "");
  out.push("## Open issues", "", h.openIssues.length ? h.openIssues.map((o) => `- ${o.findingId} (severity ${o.severity}) ${o.title} — ${o.plan}`).join("\n") : "_None._", "");
  out.push("## Prototype links", "", "| From | Element | To |", "| --- | --- | --- |", ...p.links.map((l) => `| ${l.from.screenId}/${l.from.state} | ${l.trigger === "auto" ? "(auto)" : `\`${l.element}\``} | ${l.to.screenId}/${l.to.state} |`), "");
  return out.join("\n");
}

export const prototyper: AgentModule<Prototype> = {
  id: "prototyper",
  stage: "prototype",
  schema: PrototypeSchema,
  tools: [],
  buildTask: (ctx) =>
    stageTask(ctx, {
      inputs: [
        { stage: "architecture", label: "Architecture (flows and sitemap)", pick: (a: Architecture) => ({ flows: a.flows, sitemap: a.sitemap, screens: a.screens.map((s) => ({ id: s.id, priority: s.priority })) }) },
        { stage: "ui", label: "UI" },
        { stage: "critique", label: "Critique", pick: (c: Critique) => ({ findings: c.findings }) },
      ],
      instructions:
        "Wire the UI into a clickable prototype that follows the task flows: choose the entry screen, link every primary action and navigation element " +
        "to the screen state it leads to (use auto links to move on from loading states), and write the developer handoff.",
    }),
  dod: (data, ctx) =>
    prototypeDod(data, {
      ui: ctx.upstream.ui?.data as UI | undefined,
      arch: ctx.upstream.architecture?.data as Architecture | undefined,
      critique: ctx.upstream.critique?.data as Critique | undefined,
    }),
  toMarkdown,
  extractState: () => ({ assumptions: [], questions: [] }),
  afterSave: (slug, version) => buildPrototypeFiles(slug, version),
};
