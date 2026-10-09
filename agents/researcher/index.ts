import type { AgentModule } from "../../lib/agents/types";
import { ResearchSchema, type Research } from "./schema";
import { researchDod } from "./dod";
import { researchToMarkdown } from "./markdown";

const today = () => new Date().toISOString().slice(0, 10);

export const researcher: AgentModule<Research> = {
  id: "researcher",
  stage: "research",
  schema: ResearchSchema,
  tools: ["WebSearch", "WebFetch", "Read", "Glob", "Agent"],

  subagents: (ctx) => ({
    competitors: {
      description: "Finds and analyses 3-6 competitors and alternatives, with cited sources.",
      prompt:
        "You research competitors for a product designer. Find 3-6 direct, indirect and substitute products. " +
        "Open each product's own site, store listing or help pages, plus credible reviews. For each: what it does, " +
        "strengths, weaknesses, notable UX patterns, and the URLs you actually read with today's date (" + today() + "). " +
        "Report facts only; never invent features, numbers or quotes.",
      tools: ["WebSearch", "WebFetch"],
    },
    "market-signals": {
      description: "Finds published research, standards and regulations relevant to the problem.",
      prompt:
        "You look for credible published evidence about a problem space: research papers, industry reports, " +
        "government or standards bodies, accessibility and platform guidelines, and relevant regulation. " +
        "Return short findings, each with its source URL and today's date (" + today() + "). Say plainly when you find nothing solid.",
      tools: ["WebSearch", "WebFetch"],
    },
    ...(ctx.uploads.length
      ? {
          uploads: {
            description: "Reads every uploaded file (PDFs, images, CSVs, transcripts) and extracts findings.",
            prompt:
              "You synthesise research files uploaded by a designer, found in the uploads/ folder. Read every file. " +
              "For each, list the key findings, quoting only what the file actually says. For CSVs, describe columns " +
              "and notable patterns. Never add findings that are not in the files.",
            tools: ["Read", "Glob"],
          },
        }
      : {}),
  }),

  buildTask: (ctx) => {
    const parts = [
      `# Project: ${ctx.project.name}`,
      `Platforms: ${ctx.project.platforms.join(", ")}`,
      `Today's date: ${today()}`,
      "",
      "## Brief",
      ctx.brief.trim(),
      "",
      "## Uploaded files",
      ctx.uploads.length
        ? ctx.uploads.map((u) => `- uploads/${u}`).join("\n")
        : "None. No user research has been provided, so every persona must be marked as an assumption.",
    ];
    if (ctx.revision) {
      parts.push(
        "",
        "## Revision requested",
        "Revise your previous research to address these notes. Keep what is still right.",
        ctx.revision.notes,
        "",
        "Previous version:",
        "```json",
        JSON.stringify(ctx.revision.previous, null, 2),
        "```",
      );
    }
    parts.push("", "When your research is complete, call submit_artifact with the full result.");
    return parts.join("\n");
  },

  dod: (data, ctx) => researchDod(data, { uploads: ctx.uploads }),
  toMarkdown: researchToMarkdown,
  extractState: (data) => ({ assumptions: data.assumptions, questions: data.openQuestions }),
};
