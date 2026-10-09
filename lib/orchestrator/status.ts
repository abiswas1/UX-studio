import { STAGES, isAvailable, type StageId } from "../stages";
import { getLatest, getPointer, type ArtifactMeta } from "../storage/artifacts";
import { briefFingerprint } from "../storage/projects";

export type StageStatus =
  | "coming_soon"
  | "not_started"
  | "blocked"
  | "running"
  | "needs_review"
  | "checks_failed"
  | "approved"
  | "stale";

export interface StageState {
  stage: StageId;
  status: StageStatus;
  latest: number | null;
  approved: number | null;
  staleBecause?: string[];
  latestMeta?: ArtifactMeta;
}

/** The version a downstream stage should build from: the approved one. */
export async function currentRef(slug: string, stage: StageId): Promise<number | null> {
  return (await getPointer(slug, stage))?.approved ?? null;
}

/** What a stage would be built from right now. */
export async function currentInputs(slug: string, stage: StageId): Promise<Record<string, string | number | null>> {
  const def = STAGES.find((s) => s.id === stage)!;
  if (def.dependsOn.length === 0 && stage === "research") return { brief: await briefFingerprint(slug) };
  const inputs: Record<string, string | number | null> = {};
  for (const dep of def.dependsOn) inputs[dep] = await currentRef(slug, dep);
  return inputs;
}

export async function stageStates(slug: string, running: Set<StageId> = new Set()): Promise<StageState[]> {
  const out: StageState[] = [];
  for (const def of STAGES) {
    const pointer = await getPointer(slug, def.id);
    const latest = pointer ? await getLatest(slug, def.id) : null;
    const base = { stage: def.id, latest: pointer?.latest ?? null, approved: pointer?.approved ?? null, latestMeta: latest?.meta };
    if (!isAvailable(def)) { out.push({ ...base, status: "coming_soon" }); continue; }
    if (running.has(def.id)) { out.push({ ...base, status: "running" }); continue; }

    const now = await currentInputs(slug, def.id);
    const missing = Object.entries(now).filter(([, v]) => v === null).map(([k]) => k);
    if (!latest) {
      out.push({ ...base, status: missing.length ? "blocked" : "not_started" });
      continue;
    }
    const changed = Object.entries(now)
      .filter(([k, v]) => v !== null && latest.meta.inputs[k] !== v)
      .map((k) => k[0]);
    if (changed.length) { out.push({ ...base, status: "stale", staleBecause: changed }); continue; }
    if (pointer!.approved === pointer!.latest) { out.push({ ...base, status: "approved" }); continue; }
    out.push({ ...base, status: latest.meta.dod.passed ? "needs_review" : "checks_failed" });
  }
  return out;
}
