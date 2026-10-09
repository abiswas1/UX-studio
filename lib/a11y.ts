// WCAG 2.2 colour contrast helpers.

export function parseHex(hex: string): { r: number; g: number; b: number; a: number } | null {
  const m = hex.trim().match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: m[2] ? parseInt(m[2], 16) / 255 : 1 };
}

/** Blend a possibly translucent colour over an opaque background. */
function flatten(fg: string, bg: string): { r: number; g: number; b: number } | null {
  const f = parseHex(fg);
  const b = parseHex(bg);
  if (!f || !b) return null;
  return { r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a) };
}

function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** Contrast ratio of `fg` on `bg` (1–21). Returns 0 for invalid colours. */
export function contrast(fg: string, bg: string): number {
  const back = parseHex(bg);
  const front = flatten(fg, bg);
  if (!back || !front) return 0;
  const [l1, l2] = [luminance(front), luminance(back)].sort((x, y) => y - x);
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
}
