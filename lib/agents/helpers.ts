import type { DodCheck, DodResult } from "../storage/artifacts";
import type { AgentContext } from "./types";
import type { StageId } from "../stages";

/** Collects done-checks; failure details are only kept for failed checks. */
export function checklist() {
  const checks: DodCheck[] = [];
  return {
    add(id: string, label: string, passed: boolean, detail?: string) {
      checks.push({ id, label, passed, detail: passed ? undefined : detail });
    },
    result(): DodResult {
      return { passed: checks.every((c) => c.passed), checks };
    },
  };
}

const PLATFORM_NAMES: Record<string, string> = { web: "Web", ios: "iOS", android: "Android" };

/** Standard task for a stage that builds on earlier, approved stages. */
export function stageTask(ctx: AgentContext, opts: { inputs: { stage: StageId; label: string; pick?: (data: any) => unknown }[]; instructions: string }): string {
  const parts = [
    `# Project: ${ctx.project.name}`,
    `Platforms: ${ctx.project.platforms.map((p) => PLATFORM_NAMES[p] ?? p).join(", ")}`,
    "",
    "## Brief",
    ctx.brief.trim(),
  ];
  for (const input of opts.inputs) {
    const v = ctx.upstream[input.stage];
    if (!v) continue;
    parts.push("", `## ${input.label} (approved version ${v.meta.version})`, "```json", JSON.stringify(input.pick ? input.pick(v.data) : v.data, null, 1), "```");
  }
  if (ctx.revision) {
    parts.push(
      "", "## Revision requested",
      "Revise your previous work to address these notes. Keep what is still right.",
      ctx.revision.notes, "", "Previous version:", "```json", JSON.stringify(ctx.revision.previous, null, 1), "```",
    );
  }
  parts.push("", "## Your task", opts.instructions, "", "When you are done, call submit_artifact with the complete result.");
  return parts.join("\n");
}

export function list(items: string[]): string {
  return items.length ? items.map((i) => `- ${i}`).join("\n") : "_None._";
}

/** Mobile layout if the project ships on iOS or Android, desktop if web only. */
export function primaryForm(platforms: string[]): "mobile" | "desktop" {
  return platforms.some((p) => p === "ios" || p === "android") ? "mobile" : "desktop";
}
