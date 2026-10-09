import { z } from "zod";
import { BLOCK_TYPES } from "../wireframer/schema";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, "Hex colour, e.g. #006B60");

export const PALETTE_ROLES = [
  "background", "surface", "surfaceAlt", "text", "textMuted", "primary", "onPrimary", "primaryContainer", "onPrimaryContainer",
  "border", "danger", "onDanger", "dangerContainer", "onDangerContainer", "success", "warning", "focus",
] as const;

export const Palette = z.object(Object.fromEntries(PALETTE_ROLES.map((r) => [r, hex])) as Record<(typeof PALETTE_ROLES)[number], typeof hex>);

const TypeStyle = z.object({ size: z.number().min(8).max(96), lineHeight: z.number().min(8).max(120), weight: z.number().int().min(100).max(900) });

export const TYPE_ROLES = ["display", "headline", "title", "body", "label", "caption"] as const;

export const DesignSystemSchema = z.object({
  source: z.object({
    kind: z.enum(["figma", "tokens", "generated"]).describe("Where the system came from"),
    fileKey: z.string().describe("Figma file key, or empty"),
    notes: z.string().describe("What was read, and anything that couldn't be read"),
  }),
  libraries: z
    .array(z.object({ name: z.string(), libraryKey: z.string(), platforms: z.array(z.enum(["ios", "android", "web"])), usage: z.string() }))
    .describe("Figma libraries used, and for which platforms; empty when generated"),
  themes: z
    .array(
      z.object({
        platform: z.enum(["ios", "android", "web"]),
        library: z.string().describe("Library this theme follows, or 'Generated'"),
        fontFamily: z.string(),
        fallbackFont: z.string().describe("CSS fallback stack for previews"),
        color: z.object({ light: Palette, dark: Palette }),
        type: z.object(Object.fromEntries(TYPE_ROLES.map((r) => [r, TypeStyle])) as Record<(typeof TYPE_ROLES)[number], typeof TypeStyle>),
        radius: z.object({ sm: z.number(), md: z.number(), lg: z.number(), full: z.number() }),
        spacing: z.array(z.number()).min(4).describe("Spacing scale in points, smallest first"),
        minTarget: z.number().describe("Minimum touch/click target in points"),
        provenance: z.array(z.object({ token: z.string(), from: z.string() })).describe("Where key values came from, e.g. 'M3 Schemes/Primary (Teal LT)'"),
        figma: z
          .object({
            modes: z.object({ light: z.string(), dark: z.string() }).describe("Variable mode names to apply, e.g. 'Teal LT' / 'Teal DT'"),
            variables: z.record(z.string(), z.string()).describe("Palette role → library variable key, for binding pushed frames"),
            textStyles: z.record(z.string(), z.string()).describe("Type role → library text style key"),
          })
          .describe("Library bindings used when pushing to Figma; omit when the library can't be read")
          .optional(),
      }),
    )
    .min(1),
  components: z
    .array(
      z.object({
        block: z.enum(BLOCK_TYPES),
        variant: z.string().describe("Block variant this maps, or empty for all"),
        platform: z.enum(["ios", "android", "web"]),
        library: z.string(),
        component: z.string().describe("Library component name, or 'Custom'"),
        componentKey: z.string().describe("Figma component or component-set key; empty for custom"),
        notes: z.string(),
      }),
    )
    .describe("How each wireframe block maps to a library component, per platform"),
  principles: z.array(z.string()).min(2),
  assumptions: z.array(z.string()),
  openQuestions: z.array(z.string()),
});

export type DesignSystem = z.infer<typeof DesignSystemSchema>;
export type Theme = DesignSystem["themes"][number];
export type PaletteT = z.infer<typeof Palette>;
