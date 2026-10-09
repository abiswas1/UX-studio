import { z } from "zod";
import { getProject, setBrief, updateProject, logDecision } from "@/lib/storage/projects";
import { emit } from "@/lib/runtime/events";
import { handle, ok, fail } from "@/lib/api/respond";

const Body = z.object({
  mode: z.enum(["approve", "unattended"]).optional(),
  brief: z.string().trim().min(20).optional(),
  budgetUsd: z.number().positive().max(500).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await params;
    if (!(await getProject(slug))) return fail("Project not found", 404);
    const body = Body.parse(await req.json());
    if (body.brief !== undefined) await setBrief(slug, body.brief);
    if (body.mode) {
      await updateProject(slug, { mode: body.mode });
      await logDecision(slug, "Mode changed", body.mode === "approve" ? "Stop for review after each stage." : "Run on its own.");
    }
    if (body.budgetUsd) await updateProject(slug, { budgetUsd: body.budgetUsd });
    emit(slug, { type: "changed" });
    return ok();
  });
}
