import fs from "node:fs/promises";
import path from "node:path";
import { getProject } from "@/lib/storage/projects";
import { getPointer } from "@/lib/storage/artifacts";
import { projectDir } from "@/lib/storage/paths";
import { buildPrototypeFiles } from "@/lib/prototype/build";
import { fail } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

// Serves the built prototype (rebuilding it for older versions on request) or the handoff spec.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(await getProject(slug))) return fail("Project not found", 404);
  const url = new URL(req.url);
  const exportsDir = path.join(projectDir(slug), "exports");
  if (url.searchParams.get("handoff")) {
    const md = await fs.readFile(path.join(exportsDir, "handoff.md"), "utf8").catch(() => null);
    if (!md) return fail("No handoff yet", 404);
    return new Response(md, { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${slug}-handoff.md"` } });
  }
  const pointer = await getPointer(slug, "prototype");
  const v = Number(url.searchParams.get("v")) || pointer?.latest;
  if (!v) return fail("No prototype yet", 404);
  if (v !== pointer?.latest) await buildPrototypeFiles(slug, v);
  let html = await fs.readFile(path.join(exportsDir, "prototype", "index.html"), "utf8").catch(() => null);
  if (!html) {
    await buildPrototypeFiles(slug, v);
    html = await fs.readFile(path.join(exportsDir, "prototype", "index.html"), "utf8").catch(() => null);
  }
  if (!html) return fail("The prototype couldn't be built", 500);
  const headers: Record<string, string> = { "content-type": "text/html; charset=utf-8" };
  if (url.searchParams.get("download")) headers["content-disposition"] = `attachment; filename="${slug}-prototype.html"`;
  return new Response(html, { headers });
}
