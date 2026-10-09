import { z } from "zod";

// Wireframes are built from a small grey-box kit. A state is a top-to-bottom list of blocks;
// a "row" block can hold one level of blocks side by side. Text comes from the content deck
// by key (`copy`), or is sample data (`text`) such as a medication name.

export const BLOCK_TYPES = [
  "appbar", "heading", "text", "button", "input", "select", "toggle", "checkbox", "list", "card", "image",
  "banner", "empty", "spinner", "skeleton", "divider", "tabbar", "chips", "table", "sidebar", "stat", "row",
] as const;

const base = {
  type: z.enum(BLOCK_TYPES),
  copy: z.string().describe("Content key (screenId.element) for this block's main text; empty if none").default(""),
  text: z.string().describe("Sample data or placeholder text when there is no content key").default(""),
  variant: z
    .enum(["primary", "secondary", "tertiary", "destructive", "info", "success", "warning", "error", "none"])
    .describe("Buttons: primary/secondary/tertiary/destructive. Banners: info/success/warning/error.")
    .default("none"),
  items: z.array(z.string()).describe("Content keys or sample text for list rows, tabs, chips, table columns, sidebar links").default([]),
  count: z.number().int().min(0).max(20).describe("Repeat count for list rows or skeleton lines").default(0),
  note: z.string().describe("Design annotation shown beside the wireframe").default(""),
};

export const BaseBlock = z.object(base);
export const Block = z.object({ ...base, children: z.array(BaseBlock).describe("Only for type 'row'").default([]) });

export const WireframesSchema = z.object({
  screens: z
    .array(
      z.object({
        screenId: z.string(),
        name: z.string(),
        form: z.enum(["mobile", "desktop"]),
        states: z
          .array(
            z.object({
              state: z.string().describe("default, empty, loading, error, success, offline, …"),
              blocks: z.array(Block).min(2),
              notes: z.string().default(""),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
  annotations: z.array(z.string()).describe("Cross-screen notes: navigation, patterns, accessibility").default([]),
  assumptions: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
});

export type Wireframes = z.infer<typeof WireframesSchema>;
export type WireBlock = z.infer<typeof Block>;
