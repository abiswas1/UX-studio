import Link from "next/link";
import { notFound } from "next/navigation";
import { buildReport } from "@/lib/export/report";
import { markdownToHtml } from "@/lib/export/markdown-html";
import { getVersion } from "@/lib/storage/artifacts";
import { copyLookup } from "@/lib/copy";
import { UIScreen, isWideScreen, type Platform } from "@/components/UIRender";
import { ReportTools } from "@/components/ReportTools";
import type { UI } from "@/agents/ui/schema";
import type { DesignSystem } from "@/agents/design-system/schema";
import type { Content } from "@/agents/content/schema";

export const dynamic = "force-dynamic";

const NAMES: Record<string, string> = { ios: "iOS", android: "Android", web: "Web" };

// The whole project as one printable document: brief, every stage's write-up, the main UI
// screens, then assumptions, open questions and decisions. "Save as PDF" uses the browser's print.
export default async function ReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const report = await buildReport(slug);
  if (!report) notFound();
  const html = markdownToHtml(report.markdown);

  // A gallery of each UI screen's first state, per platform, in light mode.
  const uiSection = report.sections.find((s) => s.stage === "ui");
  let gallery: React.ReactNode = null;
  if (uiSection) {
    const ui = uiSection.artifact.data as UI;
    const ds = (await getVersion<DesignSystem>(slug, "design-system", Number(uiSection.artifact.meta.inputs["design-system"])))?.data;
    const content = (await getVersion<Content>(slug, "content", Number(uiSection.artifact.meta.inputs.content)))?.data;
    const lookup = copyLookup(content ?? null);
    const themes = (ds?.themes ?? []).filter((t) => report.project.platforms.includes(t.platform));
    if (themes.length) {
      gallery = (
        <section className="report-gallery">
          <h2>Screens</h2>
          <p className="faint">The first state of each screen, in light mode. The clickable prototype has every state.</p>
          {themes.map((theme) => (
            <div key={theme.platform} className="report-platform">
              <h3>{NAMES[theme.platform]}</h3>
              <div className={`report-screens ${theme.platform === "web" ? "web" : ""}`}>
                {ui.screens.map((s) => (
                  <figure key={s.screenId}>
                    <UIScreen blocks={s.states[0].blocks} lookup={lookup} theme={theme} mode="light" platform={theme.platform as Platform} presentation={s.presentation} screenName={s.name} wide={isWideScreen(s.states)} />
                    <figcaption>{s.name} · {s.states[0].state}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ))}
        </section>
      );
    }
  }

  return (
    <>
      <header className="topbar no-print">
        <Link href="/" className="brand">UX Studio</Link>
        <nav className="crumbs" aria-label="Breadcrumb">
          <span>/</span><Link href={`/p/${slug}`}>{report.project.name}</Link><span>/</span><span>Report</span>
        </nav>
      </header>
      <main className="page report">
        <ReportTools slug={slug} />
        {report.missing.length > 0 && <div className="notice warn no-print">Not produced yet: {report.missing.join(", ")}. The report includes what exists so far.</div>}
        <article className="report-body" dangerouslySetInnerHTML={{ __html: html }} />
        {gallery}
      </main>
    </>
  );
}
