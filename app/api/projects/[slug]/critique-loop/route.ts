import { startCritiqueLoop } from "@/lib/orchestrator/orchestrator";
import { handle, ok } from "@/lib/api/respond";

export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await params;
    return ok({ runId: await startCritiqueLoop(slug) }, 202);
  });
}
