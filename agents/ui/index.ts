import type { AgentModule } from "../../lib/agents/types";
import { checklist, list, stageTask } from "../../lib/agents/helpers";
import type { Architecture } from "../architect/schema";
import type { Content } from "../content/schema";
import type { Wireframes } from "../wireframer/schema";
import type { DesignSystem } from "../design-system/schema";
import { UISchema, type UI, type UIBlockT } from "./schema";

const INTERACTIVE = new Set(["button", "input", "select", "toggle", "checkbox", "tabbar", "chips"]);
const flat = (blocks: UIBlockT[]) => blocks.flatMap((b) => [b, ...(b.children as UIBlockT[])]);
const componentId = (b: { type: string; variant: string }) => (b.type === "button" ? `button/${b.variant === "none" ? "secondary" : b.variant}` : b.type);

export function uiDod(ui: UI, deps: { arch?: Architecture; content?: Content; wireframes?: Wireframes; platforms: string[] }) {
  const k = checklist();

  if (deps.wireframes) {
    const missing: string[] = [];
    for (const w of deps.wireframes.screens) {
      const s = ui.screens.find((x) => x.screenId === w.screenId);
      if (!s) { missing.push(w.screenId); continue; }
      for (const st of w.states) if (!s.states.some((x) => x.state === st.state)) missing.push(`${w.screenId}/${st.state}`);
    }
    k.add("coverage", "Every wireframed screen and state has a high-fidelity design", missing.length === 0, `Missing: ${missing.join(", ")}.`);
  }

  const primary: string[] = [];
  for (const s of ui.screens) for (const st of s.states) {
    const n = flat(st.blocks).filter((b) => b.type === "button" && b.variant === "primary").length;
    if (st.state === "loading" ? n > 1 : n !== 1) primary.push(`${s.screenId}/${st.state}: ${n}`);
  }
  k.add("one-primary", "Each screen state has exactly one primary action", primary.length === 0, primary.join("; "));

  if (deps.content) {
    const keys = new Set([...deps.content.screens.flatMap((s) => s.strings.map((x) => x.key)), ...deps.content.errors.map((e) => e.id)]);
    const used = ui.screens.flatMap((s) => s.states.flatMap((st) => flat(st.blocks).flatMap((b) => [b.copy, b.a11yLabel, ...b.items.filter((i) => /^[a-z0-9-]+\.[a-z0-9-.]+$/.test(i))])));
    const unknown = [...new Set(used.filter((x) => x && !keys.has(x)))];
    k.add("copy-keys", "Every text key exists in the content deck", unknown.length === 0, `Unknown: ${unknown.slice(0, 8).join(", ")}`);
  }

  const iconOnly = ui.screens.flatMap((s) => s.states.flatMap((st) => flat(st.blocks)
    .filter((b) => b.type === "button" && b.icon !== "none" && !b.copy && !b.text && !b.a11yLabel)
    .map(() => `${s.screenId}/${st.state}`)));
  k.add("a11y-names", "Icon-only buttons have an accessible name", iconOnly.length === 0, [...new Set(iconOnly)].join(", "));

  const used = new Set(ui.screens.flatMap((s) => s.states.flatMap((st) => flat(st.blocks).filter((b) => INTERACTIVE.has(b.type)).map(componentId))));
  const needed = (c: string) => ["default", "focus", "disabled", deps.platforms.includes("web") ? "hover" : "pressed"].filter((s) => !(c === "tabbar" && s === "disabled"));
  const gaps: string[] = [];
  for (const c of used) {
    const spec = ui.componentStates.find((x) => x.component === c);
    const have = new Set(spec?.states.map((s) => s.state) ?? []);
    const lacking = needed(c).filter((s) => !have.has(s as never));
    if (lacking.length) gaps.push(`${c}: ${lacking.join("/")}`);
  }
  k.add("states", "Every interactive component defines default, focus, disabled and pressed (or hover on web) states", gaps.length === 0, gaps.join("; "));

  if (deps.arch) {
    const mismatch = ui.screens.filter((s) => {
      const nav = deps.arch!.sitemap.find((m) => m.screenId === s.screenId)?.navigation;
      return (nav === "sheet" && s.presentation !== "sheet") || (nav === "modal" && s.presentation === "full");
    }).map((s) => s.screenId);
    k.add("presentation", "Sheets and modals are presented the way the architecture says", mismatch.length === 0, mismatch.join(", "));
  }
  return k.result();
}

function toMarkdown(ui: UI): string {
  const out = ["# UI", "", "High-fidelity screens render in UX Studio with the design system's theme per platform, in light and dark mode.", ""];
  for (const s of ui.screens) {
    out.push(`## ${s.name} (\`${s.screenId}\`, ${s.presentation})`, "");
    for (const st of s.states) {
      out.push(`### ${st.state}`, "");
      for (const b of st.blocks) {
        out.push(`- **${b.type}**${b.variant !== "none" ? ` (${b.variant})` : ""}${b.icon !== "none" ? ` [${b.icon}]` : ""}${b.state !== "default" ? ` {${b.state}}` : ""}: ${b.copy || b.text || b.items.join(", ")}`);
      }
      if (st.notes) out.push("", `_${st.notes}_`);
      out.push("");
    }
  }
  out.push("## Component states", "");
  for (const c of ui.componentStates) out.push(`### ${c.component}`, "", list(c.states.map((s) => `${s.state}: ${s.spec}`)), "");
  out.push("## Motion", "", list(ui.motion), "", "## Assumptions", "", list(ui.assumptions), "", "## Open questions", "", list(ui.openQuestions), "");
  return out.join("\n");
}

export const uiDesigner: AgentModule<UI> = {
  id: "ui",
  stage: "ui",
  schema: UISchema,
  tools: [],
  buildTask: (ctx) =>
    stageTask(ctx, {
      inputs: [
        { stage: "wireframes", label: "Wireframes" },
        { stage: "content", label: "Content deck", pick: (c: Content) => ({ screens: c.screens, errors: c.errors }) },
        { stage: "design-system", label: "Design system", pick: (d: DesignSystem) => ({ themes: d.themes.map((t) => ({ platform: t.platform, library: t.library, type: t.type, radius: t.radius, minTarget: t.minTarget })), components: d.components }) },
      ],
      instructions:
        "Turn every wireframed screen and state into a high-fidelity design using the design system: choose icons, emphasis and presentation (sheet, modal or full screen as the architecture says), " +
        "and define every interactive component's states. Keep the wireframes' structure unless you have a reason to change it, and note any change.",
    }),
  dod: (data, ctx) =>
    uiDod(data, {
      arch: ctx.upstream.architecture?.data as Architecture | undefined,
      content: ctx.upstream.content?.data as Content | undefined,
      wireframes: ctx.upstream.wireframes?.data as Wireframes | undefined,
      platforms: ctx.project.platforms,
    }),
  toMarkdown,
  extractState: (d) => ({ assumptions: d.assumptions, questions: d.openQuestions }),
};
