import { z } from "zod";
import { saveEdit } from "@/lib/orchestrator/orchestrator";
import { stageById, type StageId } from "@/lib/stages";
import { handle, ok, fail } from "@/lib/api/respond";

const Body = z.object({ data: z.unknown(), basedOn: z.number().int().positive(), note: z.string().optional() });

export async function POST(req: Request, { params }: { params: Promise<{ slug: string; stage: string }> }) {
  return handle(async () => {
    const { slug, stage } = await params;
    if (!stageById(stage)) return fail("Unknown stage", 404);
    const body = Body.parse(await req.json());
    const v = await saveEdit(slug, stage as StageId, body.data, body.basedOn, body.note);
    return ok({ version: v.meta.version, dod: v.meta.dod }, 201);
  });
}
