import type { AgentModule } from "../../lib/agents/types";
import { checklist, list, stageTask } from "../../lib/agents/helpers";
import type { Architecture } from "../architect/schema";
import { ContentSchema, type Content } from "./schema";

const VAGUE_BUTTONS = /^(ok|okay|submit|click here|yes|no|continue|go|done)$/i;

export function contentDod(c: Content, arch: Architecture | undefined) {
  const k = checklist();
  const all = c.screens.flatMap((s) => s.strings);
  const keys = all.map((s) => s.key);
  const dupes = keys.filter((x, i) => keys.indexOf(x) !== i);
  k.add("unique-keys", "Every string has a unique key", dupes.length === 0, `Duplicates: ${[...new Set(dupes)].join(", ")}.`);

  const wrongPrefix = c.screens.flatMap((s) => s.strings.filter((x) => !x.key.startsWith(`${s.screenId}.`)).map((x) => x.key));
  k.add("key-prefix", "Keys start with their screen id", wrongPrefix.length === 0, wrongPrefix.slice(0, 6).join(", "));

  if (arch) {
    const ids = new Set(arch.screens.map((s) => s.id));
    const unknown = c.screens.filter((s) => !ids.has(s.screenId)).map((s) => s.screenId);
    k.add("known-screens", "Copy only covers screens from the architecture", unknown.length === 0, unknown.join(", "));

    const needed = arch.screens.filter((s) => s.priority !== "P2");
    const missing = needed.filter((s) => !c.screens.some((x) => x.screenId === s.id)).map((s) => s.id);
    k.add("coverage", "Every P0 and P1 screen has copy", missing.length === 0, `Missing: ${missing.join(", ")}.`);

    const errorScreens = arch.screens.filter((s) => s.priority !== "P2" && s.states.some((x) => x.state === "error")).map((s) => s.id);
    const noError = errorScreens.filter((id) => !c.errors.some((e) => e.screenId === id));
    k.add("errors", "Every error state has an error message", noError.length === 0, `No error message for: ${noError.join(", ")}.`);

    const emptyScreens = arch.screens.filter((s) => s.priority !== "P2" && s.states.some((x) => x.state === "empty")).map((s) => s.id);
    const noEmpty = emptyScreens.filter((id) => !c.screens.find((x) => x.screenId === id)?.strings.some((x) => x.state === "empty"));
    k.add("empty", "Every empty state has copy", noEmpty.length === 0, `No empty-state copy for: ${noEmpty.join(", ")}.`);
  }

  const buttons = all.filter((s) => s.kind === "button");
  const vague = buttons.filter((b) => VAGUE_BUTTONS.test(b.text.trim()));
  k.add("button-labels", "Button labels say what happens (no 'OK', 'Submit', 'Click here')", vague.length === 0, vague.map((b) => `${b.key}: "${b.text}"`).join(", "));
  const long = buttons.filter((b) => b.text.length > 28);
  k.add("button-length", "Button labels are 28 characters or fewer", long.length === 0, long.map((b) => b.key).join(", "));

  const blame = c.errors.filter((e) => /\b(invalid|illegal|fatal|you failed|error code)\b/i.test(e.message));
  k.add("error-tone", "Error messages avoid blame and jargon", blame.length === 0, blame.map((e) => e.id).join(", "));
  const noWayForward = c.errors.filter((e) => !e.action.trim() && !/\b(try|check|tap|select|enter|choose|contact|go|open|turn)\b/i.test(e.message));
  k.add("error-action", "Every error says what to do next", noWayForward.length === 0, noWayForward.map((e) => e.id).join(", "));

  return k.result();
}

function toMarkdown(c: Content): string {
  const out = ["# Content", "", "## Voice", "", list(c.voice.principles), ""];
  if (c.voice.toneByContext.length) {
    out.push("| Context | Tone |", "| --- | --- |", ...c.voice.toneByContext.map((t) => `| ${t.context} | ${t.tone} |`), "");
  }
  if (c.voice.glossary.length) {
    out.push("### Glossary", "", "| Use | When | Avoid |", "| --- | --- | --- |", ...c.voice.glossary.map((g) => `| ${g.term} | ${g.use} | ${g.avoid.join(", ")} |`), "");
  }
  out.push("## Copy by screen", "");
  for (const s of c.screens) {
    out.push(`### ${s.screenId}`, "", "| Key | Kind | State | Text | Notes |", "| --- | --- | --- | --- | --- |");
    for (const x of s.strings) out.push(`| \`${x.key}\` | ${x.kind} | ${x.state} | ${x.text.replace(/\|/g, "\\|")} | ${x.notes} |`);
    out.push("");
  }
  out.push("## Error messages", "", "| Screen | Situation | Message | Action |", "| --- | --- | --- | --- |");
  for (const e of c.errors) out.push(`| ${e.screenId} | ${e.situation} | ${e.message} | ${e.action} |`);
  out.push("");
  if (c.notifications.length) {
    out.push("## Notifications", "", "| Trigger | Title | Body |", "| --- | --- | --- |", ...c.notifications.map((n) => `| ${n.trigger} | ${n.title} | ${n.body} |`), "");
  }
  out.push("## Assumptions", "", list(c.assumptions), "", "## Open questions", "", list(c.openQuestions), "");
  return out.join("\n");
}

export const contentDesigner: AgentModule<Content> = {
  id: "content",
  stage: "content",
  schema: ContentSchema,
  tools: [],
  buildTask: (ctx) =>
    stageTask(ctx, {
      inputs: [
        { stage: "research", label: "Research (personas and insights)", pick: (r) => ({ problem: r.problem, personas: r.personas, insights: r.insights }) },
        { stage: "architecture", label: "Architecture", pick: (a) => ({ screens: a.screens, flows: a.flows.map((f: { id: string; name: string; steps: string[] }) => ({ id: f.id, name: f.name, steps: f.steps })) }) },
      ],
      instructions:
        "Write the UX copy for every P0 and P1 screen in the architecture, in every state, plus error messages and any notifications. " +
        "Set the voice first, then write the strings.",
    }),
  dod: (data, ctx) => contentDod(data, ctx.upstream.architecture?.data as Architecture | undefined),
  toMarkdown,
  extractState: (d) => ({ assumptions: d.assumptions, questions: d.openQuestions }),
};
