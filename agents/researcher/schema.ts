import { z } from "zod";

// Output contract for the Researcher. Every claim about a competitor carries sources;
// every persona, job and insight says whether it rests on evidence or is an assumption.

export const Basis = z
  .enum(["evidence", "assumption"])
  .describe("evidence = backed by a cited source or an uploaded file; assumption = reasoned guess, to be validated");

export const Source = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  accessed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Date the page was read, YYYY-MM-DD"),
});

export const ResearchSchema = z.object({
  problem: z.object({
    statement: z.string().min(20).describe("One or two sentences: who has what problem, and why it matters"),
    context: z.string(),
    whoIsAffected: z.array(z.string()).min(1),
    currentAlternatives: z.array(z.string()).describe("What people do today instead"),
    constraints: z.array(z.string()).describe("Platform, legal, technical or business constraints from the brief"),
    successSignals: z.array(z.string()).min(1).describe("Observable signs the product is working"),
  }),
  competitors: z
    .array(
      z.object({
        name: z.string(),
        url: z.string().url(),
        category: z.enum(["direct", "indirect", "substitute"]),
        summary: z.string(),
        strengths: z.array(z.string()),
        weaknesses: z.array(z.string()),
        notablePatterns: z.array(z.string()).describe("UX patterns worth learning from or avoiding"),
        sources: z.array(Source).min(1),
      }),
    )
    .describe("Competitors and alternatives, each with at least one cited source"),
  personas: z.array(
    z.object({
      name: z.string().describe("A descriptive label such as 'The overwhelmed carer', not a fake human name"),
      context: z.string(),
      goals: z.array(z.string()).min(1),
      frustrations: z.array(z.string()).min(1),
      behaviours: z.array(z.string()),
      basis: Basis,
      basisNote: z.string().describe("What this persona is based on: which upload or source, or why it is an assumption"),
    }),
  ),
  jobs: z.array(
    z.object({
      situation: z.string().describe("When …"),
      motivation: z.string().describe("I want to …"),
      outcome: z.string().describe("So I can …"),
      basis: Basis,
    }),
  ),
  insights: z.array(
    z.object({
      id: z.string().regex(/^I\d+$/).describe("I1, I2, …"),
      insight: z.string(),
      implication: z.string().describe("What this means for the design"),
      basis: Basis,
      supportedBy: z.array(z.string()).describe("Source URLs or uploaded file names backing this insight"),
    }),
  ),
  hmw: z.array(
    z.object({
      question: z.string().describe("Starts with 'How might we'"),
      linkedInsights: z.array(z.string()).min(1).describe("Insight ids this question comes from"),
    }),
  ),
  uploadsSynthesis: z
    .array(z.object({ file: z.string(), keyFindings: z.array(z.string()).min(1) }))
    .describe("One entry per uploaded file; empty when nothing was uploaded"),
  assumptions: z.array(z.string()).describe("Everything taken as true without evidence"),
  openQuestions: z.array(z.string()).describe("Questions for the designer or for user research"),
});

export type Research = z.infer<typeof ResearchSchema>;
