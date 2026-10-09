import { z } from "zod";
import { createProject } from "@/lib/storage/projects";
import { handle, ok } from "@/lib/api/respond";

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  brief: z.string().trim().min(20, "Give the brief at least a sentence or two."),
  platforms: z.array(z.enum(["web", "ios", "android"])).min(1),
  mode: z.enum(["approve", "unattended"]).default("approve"),
  sampleId: z.string().optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const body = Body.parse(await req.json());
    const project = await createProject({ ...body, sampleId: body.sampleId || undefined });
    return ok(project, 201);
  });
}
