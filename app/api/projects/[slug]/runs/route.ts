import { z } from "zod";
import { startRun } from "@/lib/orchestrator/orchestrator";
import { handle, ok } from "@/lib/api/respond";
import type { StageId } from "@/lib/stages";

const Body = z.object({
  stages: z.array(z.string()).optional(),
  mode: z.enum(["approve", "unattended"]).optional(),
  notes: z.string().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await params;
    const body = Body.parse(await req.json().catch(() => ({})));
    const runId = await startRun(slug, { stages: body.stages as StageId[] | undefined, mode: body.mode, notes: body.notes });
    return ok({ runId }, 202);
  });
}
