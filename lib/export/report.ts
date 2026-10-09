// The project report: every stage's write-up in one document, plus the brief, assumptions,
// open questions and decision log. Used for the Markdown download and the print/PDF page.
import path from "node:path";
import { STAGES, isAvailable, type StageId } from "../stages";
import { getApproved, getLatest, getMarkdown, type ArtifactVersion } from "../storage/artifacts";
import { getAssumptions, getBrief, getDecisions, getOpenQuestions, getProject, type Project } from "../storage/projects";
import { projectDir } from "../storage/paths";
import { writeFileAtomic } from "../storage/fs";

export interface ReportSection {
  stage: StageId;
  title: string;
  version: number;
  approved: boolean;
  markdown: string;
  artifact: ArtifactVersion;
}

export interface Report {
  project: Project;
  brief: string;
  sections: ReportSection[];
  missing: string[];
  markdown: string;
}

/** Push every heading down one level so stage write-ups nest under the report's own headings. */
function demote(md: string): string {
  let fenced = false;
  return md
    .split("\n")
    .map((line) => {
      if (line.startsWith("```")) fenced = !fenced;
      return !fenced && /^#{1,5} /.test(line) ? "#" + line : line;
    })
    .join("\n");
}

/**
 * Builds the report from each stage's approved version, falling back to the latest version
 * (marked as not approved) so a report is useful before every stage is signed off.
 */
export async function buildReport(slug: string): Promise<Report | null> {
  const project = await getProject(slug);
  if (!project) return null;
  const [brief, assumptions, questions, decisions] = await Promise.all([getBrief(slug), getAssumptions(slug), getOpenQuestions(slug), getDecisions(slug)]);
  const sections: ReportSection[] = [];
  const missing: string[] = [];
  for (const def of STAGES.filter(isAvailable)) {
    const approved = await getApproved(slug, def.id);
    const artifact = approved ?? (await getLatest(slug, def.id));
    const md = artifact && (await getMarkdown(slug, def.id, artifact.meta.version));
    if (!artifact || !md) {
      missing.push(def.title);
      continue;
    }
    const body = md.replace(/^<!--.*-->\n\n/, "").replace(/^# .*\n+/, "");
    sections.push({ stage: def.id, title: def.title, version: artifact.meta.version, approved: !!approved, markdown: demote(body).trim(), artifact });
  }

  const date = new Date().toISOString().slice(0, 10);
  const out: string[] = [
    `# ${project.name}`,
    "",
    `Design report · ${project.platforms.map((p) => ({ ios: "iOS", android: "Android", web: "Web" })[p]).join(" · ")} · ${date}`,
    "",
    "## Contents",
    "",
    "1. Brief",
    ...sections.map((s, i) => `${i + 2}. ${s.title}`),
    `${sections.length + 2}. Assumptions, open questions and decisions`,
    "",
    "## Brief",
    "",
    brief.trim(),
    "",
  ];
  if (missing.length) out.push(`> Not produced yet: ${missing.join(", ")}.`, "");
  for (const s of sections) {
    out.push(`## ${s.title}`, "", `_Version ${s.version}${s.approved ? " · approved" : " · not approved yet"}_`, "", s.markdown, "");
  }
  out.push("## Assumptions, open questions and decisions", "");
  out.push("### Assumptions", "", ...(assumptions.length ? assumptions.map((a) => `- ${a.text} _(${a.stage}${a.status !== "open" ? `, ${a.status}` : ""})_`) : ["None recorded."]), "");
  out.push("### Open questions", "", ...(questions.length ? questions.map((q) => `- ${q.text} _(${q.stage})_`) : ["None recorded."]), "");
  out.push("### Decision log", "", decisions.replace(/^# .*\n+/, "").trim() || "Nothing logged yet.", "");
  return { project, brief, sections, missing, markdown: out.join("\n") };
}

/** Writes exports/report.md and returns its contents. */
export async function writeReportMarkdown(slug: string): Promise<string | null> {
  const report = await buildReport(slug);
  if (!report) return null;
  await writeFileAtomic(path.join(projectDir(slug), "exports", "report.md"), report.markdown);
  return report.markdown;
}
