import { stopRun } from "@/lib/orchestrator/orchestrator";
import { getRun } from "@/lib/storage/db";
import { handle, ok, fail } from "@/lib/api/respond";

export async function DELETE(_req: Request, { params }: { params: Promise<{ slug: string; runId: string }> }) {
  return handle(async () => {
    const { slug, runId } = await params;
    if (getRun(runId)?.project !== slug) return fail("Run not found", 404);
    stopRun(runId);
    return ok();
  });
}
