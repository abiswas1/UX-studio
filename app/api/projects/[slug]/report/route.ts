import { writeReportMarkdown } from "@/lib/export/report";
import { fail } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

// The whole project as one Markdown file (also saved to exports/report.md).
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const md = await writeReportMarkdown(slug);
  if (md === null) return fail("Project not found", 404);
  return new Response(md, {
    headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${slug}-report.md"` },
  });
}
