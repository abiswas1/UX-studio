import { checklist } from "../../lib/agents/helpers";
import { checkMermaid } from "../../lib/mermaid";
import type { DodResult } from "../../lib/storage/artifacts";
import { REQUIRED_P0_STATES, type Architecture } from "./schema";

export async function architectureDod(a: Architecture): Promise<DodResult> {
  const c = checklist();
  const ids = new Set(a.screens.map((s) => s.id));

  const dupes = a.screens.map((s) => s.id).filter((id, i, all) => all.indexOf(id) !== i);
  c.add("unique-ids", "Screen ids are unique", dupes.length === 0, `Duplicates: ${[...new Set(dupes)].join(", ")}.`);

  const p0 = a.screens.filter((s) => s.priority === "P0");
  c.add("p0", "At least 3 P0 screens", p0.length >= 3, `Found ${p0.length}.`);

  const missingStates: string[] = [];
  for (const s of p0) {
    const has = new Set([...s.states.map((x) => x.state), ...s.statesNotNeeded.map((x) => x.state)]);
    for (const req of REQUIRED_P0_STATES) if (!has.has(req)) missingStates.push(`${s.id}: ${req}`);
  }
  c.add("p0-states", "Every P0 screen covers empty, loading and error states (or says why not)", missingStates.length === 0, missingStates.join("; "));

  const noAction = a.screens.filter((s) => !s.primaryAction.trim());
  c.add("primary-action", "Every screen names one primary action", noAction.length === 0, noAction.map((s) => s.id).join(", "));

  const inMap = a.sitemap.map((m) => m.screenId);
  const notInMap = [...ids].filter((id) => !inMap.includes(id));
  const unknownInMap = inMap.filter((id) => !ids.has(id));
  const twice = inMap.filter((id, i) => inMap.indexOf(id) !== i);
  const badParents = a.sitemap.filter((m) => m.parent && !ids.has(m.parent)).map((m) => `${m.screenId} → ${m.parent}`);
  c.add(
    "sitemap",
    "The sitemap lists every screen exactly once, with valid parents",
    !notInMap.length && !unknownInMap.length && !twice.length && !badParents.length,
    [
      notInMap.length && `missing: ${notInMap.join(", ")}`,
      unknownInMap.length && `unknown: ${unknownInMap.join(", ")}`,
      twice.length && `listed twice: ${twice.join(", ")}`,
      badParents.length && `unknown parent: ${badParents.join(", ")}`,
    ].filter(Boolean).join("; "),
  );

  c.add("flows", "At least 2 task flows", a.flows.length >= 2, `Found ${a.flows.length}.`);
  const badRefs = a.flows.flatMap((f) => f.screens.filter((s) => !ids.has(s)).map((s) => `${f.id}: ${s}`));
  c.add("flow-screens", "Flows only use screens from the inventory", badRefs.length === 0, badRefs.join(", "));

  const mermaidErrors: string[] = [];
  for (const f of a.flows) {
    const r = await checkMermaid(f.mermaid);
    if (!r.ok) mermaidErrors.push(`${f.id}: ${r.error}`);
  }
  c.add("mermaid", "Every flow diagram is valid Mermaid", mermaidErrors.length === 0, mermaidErrors.join(" | "));

  const p0Covered = p0.filter((s) => a.flows.some((f) => f.screens.includes(s.id)));
  c.add("p0-in-flows", "Every P0 screen appears in a flow", p0Covered.length === p0.length,
    `Not in any flow: ${p0.filter((s) => !p0Covered.includes(s)).map((s) => s.id).join(", ")}.`);

  return c.result();
}
