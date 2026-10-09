import { z } from "zod";
import { pushToFigma } from "@/lib/figma/push";
import { handle, ok } from "@/lib/api/respond";

const Body = z.object({ stage: z.enum(["ui", "wireframes", "architecture"]) });

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await params;
    const { stage } = Body.parse(await req.json());
    return ok(await pushToFigma(slug, stage));
  });
}
