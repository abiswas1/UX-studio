import { getProject, saveUpload } from "@/lib/storage/projects";
import { emit } from "@/lib/runtime/events";
import { handle, ok, fail } from "@/lib/api/respond";

const MAX_BYTES = 30 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const { slug } = await params;
    if (!(await getProject(slug))) return fail("Project not found", 404);
    const form = await req.formData();
    const saved: string[] = [];
    for (const value of form.getAll("files")) {
      if (typeof value === "string") continue;
      if (value.size > MAX_BYTES) return fail(`${value.name} is larger than 30 MB.`);
      saved.push(await saveUpload(slug, value.name, Buffer.from(await value.arrayBuffer())));
    }
    emit(slug, { type: "changed" });
    return ok({ saved });
  });
}
