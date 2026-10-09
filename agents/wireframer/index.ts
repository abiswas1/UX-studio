import type { AgentModule } from "../../lib/agents/types";
import { checklist, list, primaryForm, stageTask } from "../../lib/agents/helpers";
import type { Architecture } from "../architect/schema";
import type { Content } from "../content/schema";
import { WireframesSchema, type Wireframes, type WireBlock } from "./schema";

const flat = (blocks: WireBlock[]): WireBlock[] => blocks.flatMap((b) => [b, ...(b.children as WireBlock[])]);

export function wireframesDod(w: Wireframes, arch: Architecture | undefined, content: Content | undefined, platforms: string[]) {
  const k = checklist();

  if (arch) {
    const p0 = arch.screens.filter((s) => s.priority === "P0");
    const missing = p0.filter((s) => !w.screens.some((x) => x.screenId === s.id)).map((s) => s.id);
    k.add("p0-screens", "Every P0 screen is wireframed", missing.length === 0, `Missing: ${missing.join(", ")}.`);

    const missingStates: string[] = [];
    for (const s of p0) {
      const wf = w.screens.find((x) => x.screenId === s.id);
      if (!wf) continue;
      for (const st of s.states) if (!wf.states.some((x) => x.state === st.state)) missingStates.push(`${s.id}: ${st.state}`);
    }
    k.add("p0-states", "Every state of every P0 screen is drawn", missingStates.length === 0, missingStates.join("; "));

    const ids = new Set(arch.screens.map((s) => s.id));
    const unknown = w.screens.filter((s) => !ids.has(s.screenId)).map((s) => s.screenId);
    k.add("known-screens", "Wireframes only cover screens from the architecture", unknown.length === 0, unknown.join(", "));
  }

  const primaryProblems: string[] = [];
  for (const s of w.screens) {
    for (const st of s.states) {
      const n = flat(st.blocks).filter((b) => b.type === "button" && b.variant === "primary").length;
      const ok = st.state === "loading" ? n <= 1 : n === 1;
      if (!ok) primaryProblems.push(`${s.screenId}/${st.state}: ${n}`);
    }
  }
  k.add("one-primary", "Each screen state has exactly one primary action", primaryProblems.length === 0, primaryProblems.join("; "));

  if (content) {
    const keys = new Set(content.screens.flatMap((s) => s.strings.map((x) => x.key)));
    const errorText = new Set(content.errors.map((e) => e.id));
    const used = w.screens.flatMap((s) => s.states.flatMap((st) => flat(st.blocks).flatMap((b) => [b.copy, ...b.items.filter((i) => /^[a-z0-9-]+\.[a-z0-9-.]+$/.test(i))])));
    const missing = [...new Set(used.filter((key) => key && !keys.has(key) && !errorText.has(key)))];
    k.add("copy-keys", "Every text key exists in the content deck", missing.length === 0, `Unknown keys: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "…" : ""}`);
  }

  const form = primaryForm(platforms);
  const wrongForm = w.screens.filter((s) => s.form !== form).map((s) => s.screenId);
  k.add("form", `Screens use the ${form} layout for this project's platforms`, wrongForm.length === 0, wrongForm.join(", "));

  return k.result();
}

function toMarkdown(w: Wireframes): string {
  const out = ["# Wireframes", "", "Rendered as grey-box screens in UX Studio. Structure below.", ""];
  for (const s of w.screens) {
    out.push(`## ${s.name} (\`${s.screenId}\`, ${s.form})`, "");
    for (const st of s.states) {
      out.push(`### ${st.state}`, "");
      for (const b of st.blocks) {
        const label = b.copy || b.text || b.items.join(", ");
        out.push(`- **${b.type}**${b.variant !== "none" ? ` (${b.variant})` : ""}${label ? `: ${label}` : ""}${b.note ? ` — _${b.note}_` : ""}`);
        for (const c of b.children) out.push(`  - **${c.type}**${c.variant !== "none" ? ` (${c.variant})` : ""}: ${c.copy || c.text || c.items.join(", ")}`);
      }
      if (st.notes) out.push("", `_${st.notes}_`);
      out.push("");
    }
  }
  out.push("## Annotations", "", list(w.annotations), "", "## Assumptions", "", list(w.assumptions), "", "## Open questions", "", list(w.openQuestions), "");
  return out.join("\n");
}

export const wireframer: AgentModule<Wireframes> = {
  id: "wireframer",
  stage: "wireframes",
  schema: WireframesSchema,
  tools: [],
  buildTask: (ctx) =>
    stageTask(ctx, {
      inputs: [
        { stage: "architecture", label: "Architecture", pick: (a) => ({ screens: a.screens, sitemap: a.sitemap }) },
        { stage: "content", label: "Content deck", pick: (c) => ({ screens: c.screens, errors: c.errors }) },
      ],
      instructions:
        `Wireframe every P0 screen in every state the architecture lists, then P1 screens if they clarify the flows. ` +
        `Use the ${primaryForm(ctx.project.platforms)} layout. Reference copy by its content key; use sample data only for user data such as names or times.`,
    }),
  dod: (data, ctx) =>
    wireframesDod(data, ctx.upstream.architecture?.data as Architecture | undefined, ctx.upstream.content?.data as Content | undefined, ctx.project.platforms),
  toMarkdown,
  extractState: (d) => ({ assumptions: d.assumptions, questions: d.openQuestions }),
};
