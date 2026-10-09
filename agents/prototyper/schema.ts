import { z } from "zod";

const Ref = z.object({ screenId: z.string(), state: z.string().describe("A state name, or * for any state of the screen") });

export const PrototypeSchema = z.object({
  entry: z.object({ screenId: z.string(), state: z.string() }),
  links: z
    .array(
      z.object({
        from: Ref,
        element: z.string().describe("Content key of the tapped element (button, tab, list row, app bar action); empty for auto links"),
        to: z.object({ screenId: z.string(), state: z.string() }),
        trigger: z.enum(["tap", "auto"]).describe("auto = advance after a short delay, for loading states"),
        note: z.string().default(""),
      }),
    )
    .min(1),
  staticActions: z
    .array(z.object({ screenId: z.string(), state: z.string(), element: z.string(), reason: z.string() }))
    .describe("Primary actions deliberately left without a destination, with why")
    .default([]),
  handoff: z.object({
    overview: z.string(),
    screens: z.array(
      z.object({
        screenId: z.string(),
        purpose: z.string(),
        behaviour: z.array(z.string()).min(1),
        data: z.array(z.string()).describe("Data the screen reads or writes"),
        edgeCases: z.array(z.string()),
        acceptanceCriteria: z.array(z.string()).min(1),
      }),
    ),
    components: z.array(z.object({ name: z.string(), notes: z.string() })),
    accessibility: z.array(z.string()).min(1),
    analytics: z.array(z.string()).default([]),
    openIssues: z.array(z.object({ findingId: z.string(), severity: z.number().int(), title: z.string(), plan: z.string() })).describe("Unresolved critique findings").default([]),
  }),
});

export type Prototype = z.infer<typeof PrototypeSchema>;
