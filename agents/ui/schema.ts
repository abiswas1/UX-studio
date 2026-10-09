import { z } from "zod";
import { BLOCK_TYPES } from "../wireframer/schema";

// High-fidelity screens reuse the wireframe kit's block vocabulary, with the details a
// visual design needs: icons, emphasis, the component state shown, and accessible names.
// They render with the design system's theme for each platform, in light and dark mode.

export const ICONS = [
  "none", "plus", "check", "close", "chevron-right", "chevron-left", "clock", "calendar", "pill", "bell", "bell-off",
  "history", "people", "settings", "info", "warning", "error", "search", "edit", "trash", "share", "user", "home",
  "refresh", "wifi-off", "more", "filter", "download", "send", "mail",
] as const;

export const COMPONENT_STATES = ["default", "hover", "focus", "pressed", "disabled", "loading", "error", "selected"] as const;

const base = {
  type: z.enum(BLOCK_TYPES),
  copy: z.string().describe("Content key for the main text; empty if none").default(""),
  text: z.string().describe("Sample data when there is no content key").default(""),
  variant: z
    .enum(["primary", "secondary", "tertiary", "destructive", "info", "success", "warning", "error", "none"])
    .default("none"),
  items: z.array(z.string()).default([]),
  count: z.number().int().min(0).max(20).default(0),
  icon: z.enum(ICONS).describe("Leading icon").default("none"),
  emphasis: z.enum(["normal", "strong", "muted"]).default("normal"),
  state: z.enum(COMPONENT_STATES).describe("Component state shown in this mockup").default("default"),
  a11yLabel: z.string().describe("Content key for the accessible name of icon-only controls; empty if the visible text is enough").default(""),
  note: z.string().default(""),
};

export const UIBaseBlock = z.object(base);
export const UIBlock = z.object({ ...base, children: z.array(UIBaseBlock).default([]) });

export const UISchema = z.object({
  screens: z
    .array(
      z.object({
        screenId: z.string(),
        name: z.string(),
        presentation: z.enum(["full", "sheet", "modal"]).describe("How the screen appears; match the architecture's navigation"),
        states: z.array(z.object({ state: z.string(), blocks: z.array(UIBlock).min(2), notes: z.string().default("") })).min(1),
      }),
    )
    .min(1),
  componentStates: z
    .array(
      z.object({
        component: z.string().describe("Block type and variant, e.g. button/primary, input, toggle, list, tabbar"),
        states: z.array(z.object({ state: z.enum(COMPONENT_STATES), spec: z.string().describe("What changes, using design-system roles") })).min(2),
      }),
    )
    .describe("Interactive states for every interactive component used"),
  motion: z.array(z.string()).describe("Transitions and feedback, briefly").default([]),
  assumptions: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
});

export type UI = z.infer<typeof UISchema>;
export type UIBlockT = z.infer<typeof UIBlock>;
