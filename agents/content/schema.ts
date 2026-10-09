import { z } from "zod";

export const STRING_KINDS = [
  "title", "body", "button", "link", "label", "placeholder", "helper", "error", "empty", "success", "toast", "nav", "a11y",
] as const;

export const ContentSchema = z.object({
  voice: z.object({
    principles: z.array(z.string()).min(2).describe("3-5 short principles, e.g. 'Calm, never alarming'"),
    toneByContext: z.array(z.object({ context: z.string(), tone: z.string() })).describe("How the voice flexes: errors, success, onboarding…"),
    glossary: z
      .array(z.object({ term: z.string(), use: z.string().describe("When and how to use it"), avoid: z.array(z.string()) }))
      .describe("Words to use consistently, and the alternatives to avoid"),
  }),
  screens: z
    .array(
      z.object({
        screenId: z.string().describe("Screen id from the architecture"),
        strings: z
          .array(
            z.object({
              key: z.string().regex(/^[a-z0-9-]+\.[a-z0-9-.]+$/, "screenId.element, e.g. today.add-button"),
              kind: z.enum(STRING_KINDS),
              text: z.string().min(1),
              state: z.string().describe("Screen state this string belongs to: default, empty, loading, error, …"),
              notes: z.string().describe("Intent or constraints; empty if none"),
            }),
          )
          .min(1),
      }),
    )
    .describe("UX copy for every P0 and P1 screen, keyed screenId.element"),
  errors: z
    .array(
      z.object({
        id: z.string(),
        screenId: z.string(),
        situation: z.string().describe("What went wrong, in plain words"),
        message: z.string().describe("What the person sees: what happened and what to do next"),
        action: z.string().describe("Button or link label for the way forward; empty if none"),
      }),
    )
    .describe("Error messages for every error state in the inventory, plus validation errors"),
  notifications: z
    .array(z.object({ id: z.string(), trigger: z.string(), title: z.string(), body: z.string() }))
    .describe("Push notifications, emails or SMS the product sends; empty if none"),
  assumptions: z.array(z.string()),
  openQuestions: z.array(z.string()),
});

export type Content = z.infer<typeof ContentSchema>;
