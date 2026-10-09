import { z } from "zod";
import { approveStage } from "@/lib/orchestrator/orchestrator";
import { stageById, type StageId } from "@/lib/stages";
import { handle, ok, fail } from "@/lib/api/respond";

const Body = z.object({ version: z.number().int().positive(), override: z.boolean().optional() });

export async function POST(req: Request, { params }: { params: Promise<{ slug: string; stage: string }> }) {
  return handle(async () => {
    const { slug, stage } = await params;
    if (!stageById(stage)) return fail("Unknown stage", 404);
    const body = Body.parse(await req.json());
    await approveStage(slug, stage as StageId, body.version, body.override);
    return ok();
  });
}
