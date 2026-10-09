import { z } from "zod";

export const SCREEN_STATES = ["default", "empty", "loading", "error", "success", "offline", "partial", "permission"] as const;
export const ScreenState = z.enum(SCREEN_STATES);
export const REQUIRED_P0_STATES = ["empty", "loading", "error"] as const;

const screenId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "kebab-case, e.g. add-medication");

export const ArchitectureSchema = z.object({
  journeys: z
    .array(
      z.object({
        id: z.string().regex(/^J\d+$/).describe("J1, J2, …"),
        persona: z.string().describe("Persona name from research"),
        goal: z.string(),
        stages: z
          .array(
            z.object({
              stage: z.string().describe("e.g. Discover, Set up, Daily use, Change, Recover"),
              actions: z.array(z.string()).min(1),
              painPoints: z.array(z.string()),
              opportunities: z.array(z.string()),
            }),
          )
          .min(2),
      }),
    )
    .min(1),
  flows: z
    .array(
      z.object({
        id: z.string().regex(/^F\d+$/).describe("F1, F2, …"),
        name: z.string(),
        trigger: z.string().describe("What starts this flow"),
        mermaid: z.string().describe("Mermaid flowchart (flowchart TD …). Node labels may name screens; include decisions and error branches."),
        screens: z.array(screenId).min(1).describe("Screen ids this flow passes through, in order"),
        steps: z.array(z.string()).min(2).describe("Happy path in plain words"),
      }),
    )
    .min(1),
  sitemap: z
    .array(
      z.object({
        screenId,
        parent: screenId.nullable().describe("null for top-level screens"),
        navigation: z.enum(["tab", "stack", "modal", "sheet", "page"]).describe("How the screen is reached"),
      }),
    )
    .describe("Every screen in the inventory appears here exactly once"),
  screens: z
    .array(
      z.object({
        id: screenId,
        name: z.string(),
        purpose: z.string(),
        priority: z.enum(["P0", "P1", "P2"]).describe("P0 = first release can't ship without it"),
        primaryAction: z.string().describe("The one main thing to do on this screen"),
        keyContent: z.array(z.string()).min(1),
        entryPoints: z.array(z.string()),
        states: z
          .array(z.object({ state: ScreenState, description: z.string() }))
          .min(1)
          .describe("Every state the screen can be in. P0 screens need empty, loading and error unless excluded below."),
        statesNotNeeded: z
          .array(z.object({ state: ScreenState, reason: z.string() }))
          .describe("Required states this screen genuinely can't be in, with the reason"),
      }),
    )
    .min(3),
  assumptions: z.array(z.string()),
  openQuestions: z.array(z.string()),
});

export type Architecture = z.infer<typeof ArchitectureSchema>;
