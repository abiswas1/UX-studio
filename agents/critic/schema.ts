import { z } from "zod";

export const HEURISTICS = [
  "H1 Visibility of system status",
  "H2 Match between system and the real world",
  "H3 User control and freedom",
  "H4 Consistency and standards",
  "H5 Error prevention",
  "H6 Recognition rather than recall",
  "H7 Flexibility and efficiency of use",
  "H8 Aesthetic and minimalist design",
  "H9 Help users recognize, diagnose, and recover from errors",
  "H10 Help and documentation",
] as const;

/** WCAG 2.2 success criteria every critique must check. */
export const REQUIRED_WCAG = ["1.3.1", "1.4.1", "1.4.3", "1.4.11", "2.4.3", "2.4.7", "2.5.8", "3.3.1", "4.1.2", "4.1.3"] as const;

export const OWNER_STAGES = ["research", "architecture", "content", "wireframes", "design-system", "ui"] as const;

export const Finding = z.object({
  id: z.string().regex(/^[AC]\d+$/).describe("A1… for automated checks (keep their ids), C1… for your own findings"),
  title: z.string(),
  detail: z.string().describe("What the problem is and who it affects"),
  kind: z.enum(["heuristic", "wcag"]),
  heuristic: z.string().describe("One of the 10 heuristics, or empty"),
  wcag: z.string().describe("WCAG 2.2 criterion number and name, e.g. '2.5.8 Target Size (Minimum)', or empty"),
  severity: z.number().int().min(1).max(4).describe("1 cosmetic · 2 minor · 3 major (fix before release) · 4 catastrophic"),
  locations: z.array(z.object({ screenId: z.string(), state: z.string() })),
  evidence: z.string().describe("What in the design shows the problem"),
  recommendation: z.string(),
  ownerStage: z.enum(OWNER_STAGES).describe("The stage whose output must change to fix this"),
  source: z.enum(["automated", "review"]),
});

export const CritiqueSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.string()).min(1),
  findings: z.array(Finding),
  heuristicsReviewed: z.array(z.object({ heuristic: z.enum(HEURISTICS), verdict: z.enum(["good", "issues", "not applicable"]), note: z.string() })),
  wcagChecked: z.array(z.object({ criterion: z.string().describe("Number and name, e.g. '1.4.3 Contrast (Minimum)'"), result: z.enum(["pass", "fail", "needs testing"]), note: z.string() })),
});

export type Critique = z.infer<typeof CritiqueSchema>;
export type FindingT = z.infer<typeof Finding>;
