import type { StageStatus } from "@/lib/orchestrator/status";

const LABELS: Record<StageStatus, [string, string]> = {
  coming_soon: ["Coming soon", "quiet"],
  not_started: ["Not started", ""],
  blocked: ["Waiting on earlier stage", ""],
  running: ["Running", "accent running"],
  needs_review: ["Ready for review", "accent"],
  checks_failed: ["Checks failed", "bad"],
  approved: ["Approved", "good"],
  stale: ["Out of date", "warn"],
};

export function StatusChip({ status }: { status: StageStatus }) {
  const [label, cls] = LABELS[status];
  return <span className={`chip ${cls}`}>{label}</span>;
}

export function statusLabel(status: StageStatus): string {
  return LABELS[status][0];
}
