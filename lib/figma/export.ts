// Builds Figma Plugin API scripts (run with the Figma MCP `use_figma` tool) that recreate
// high-fidelity screens as editable frames: auto-layout, real text, SVG icons, and — where the
// design system has Figma bindings — library colour variables, text styles, a variable mode
// (e.g. Material 3 "Teal LT") and library button instances.
import type { UI, UIBlockT } from "../../agents/ui/schema";
import type { DesignSystem, Theme } from "../../agents/design-system/schema";
import type { Wireframes } from "../../agents/wireframer/schema";
import type { CopyLookup } from "../../components/Wireframe";
import { ICON_PATHS } from "../icons";

type Platform = "ios" | "android" | "web";
type Mode = "light" | "dark";

const KEY_RE = /^[a-z0-9-]+\.[a-z0-9-.]+$/;

function resolveText(lookup: CopyLookup, key: string, fallback = ""): string {
  if (!key) return fallback;
  const v = lookup.strings[key] ?? lookup.errors[key];
  if (v === undefined) return KEY_RE.test(key) ? `[${key}]` : key;
  return v.includes("{") && fallback ? fallback : v;
}

/** A block with its words resolved, ready for the script. */
interface RNode {
  k: string;
  variant?: string;
  text?: string;
  sub?: string[];
  rows?: { title: string; sub: string; icon: string }[];
  icon?: string;
  state?: string;
  emphasis?: string;
  label?: string;
  children?: RNode[];
}

function statusIcon(sub: string, fallback: string): string {
  if (/taken/i.test(sub)) return "check";
  if (/due/i.test(sub)) return "clock";
  if (/not marked|skipped/i.test(sub)) return "info";
  return fallback;
}

function toNode(b: UIBlockT | Omit<UIBlockT, "children">, lookup: CopyLookup): RNode {
  const t = (k: string, f = "") => resolveText(lookup, k, f);
  const item = (v: string) => (KEY_RE.test(v) ? t(v) : v);
  const icon = b.icon === "none" ? "" : b.icon;
  switch (b.type) {
    case "list":
      return {
        k: "list",
        rows: (b.items.length ? b.items : Array.from({ length: b.count || 3 }, (_, i) => `Item ${i + 1}`)).map((r) => {
          const s = item(r);
          const i = s.indexOf(" · ");
          const title = i === -1 ? s : s.slice(0, i);
          const sub = i === -1 ? "" : s.slice(i + 3);
          return { title, sub, icon: statusIcon(sub, icon || "pill") };
        }),
      };
    case "card":
      return { k: "card", text: t(b.copy, b.text), sub: b.items.map(item), icon, emphasis: b.emphasis };
    case "empty":
      return { k: "empty", text: t(b.copy, b.text), sub: b.items.map(item), icon: icon || "pill" };
    case "tabbar":
    case "chips":
    case "sidebar":
      return { k: b.type, sub: b.items.map(item) };
    case "appbar":
      return { k: "appbar", text: t(b.copy, b.text), sub: b.items.map(item), icon: icon || "plus" };
    case "row":
      return { k: "row", children: ("children" in b ? b.children : []).map((c) => toNode(c, lookup)) };
    case "input":
    case "select":
      return { k: b.type, label: t(b.copy), text: b.text, icon, state: b.state, sub: b.state === "error" && b.note ? [t(b.note.replace(/^Error: /, ""))] : [] };
    case "skeleton":
      return { k: "skeleton", text: String(b.count || 4) };
    default:
      return { k: b.type, variant: b.variant, text: t(b.copy, b.text), icon, state: b.state, emphasis: b.emphasis };
  }
}

export interface ScreenScriptInput {
  screenName: string;
  screenId: string;
  presentation: "full" | "sheet" | "modal";
  states: { state: string; nodes: RNode[] }[];
  platform: Platform;
  mode: Mode;
  theme: Theme;
  sectionName: string;
  /** Library button component-set keys by variant (from the design system's component mapping). */
  buttonSets: Record<string, string>;
}

/** Plain-JS runtime executed inside Figma. Reads the DATA constant defined before it. */
const RUNTIME = String.raw`
const D = DATA;
const T = D.theme;
const P = T.color[D.mode];
const created = [];
const notes = [];
const hexRgb = (h) => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 });
const alpha = (h) => (h.length === 9 ? parseInt(h.slice(7, 9), 16) / 255 : 1);

// Library variables (colour roles) and text styles, when the theme has Figma bindings.
const vars = {};
const styles = {};
let collection = null;
if (T.figma) {
  for (const [role, key] of Object.entries(T.figma.variables)) {
    try { vars[role] = await figma.variables.importVariableByKeyAsync(key); } catch (e) { notes.push("variable " + role + ": " + e.message); }
  }
  for (const [role, key] of Object.entries(T.figma.textStyles)) {
    try { styles[role] = await figma.importStyleByKeyAsync(key); } catch (e) { notes.push("text style " + role + ": " + e.message); }
  }
  const anyVar = Object.values(vars)[0];
  if (anyVar) collection = await figma.variables.getVariableCollectionByIdAsync(anyVar.variableCollectionId);
}
function paint(role, opacity) {
  const hex = P[role] || role;
  const base = { type: "SOLID", color: hexRgb(hex), opacity: (opacity === undefined ? 1 : opacity) * alpha(hex) };
  return vars[role] ? figma.variables.setBoundVariableForPaint(base, "color", vars[role]) : base;
}

// Fonts: the theme font if available in this Figma account, otherwise Inter.
const available = await figma.listAvailableFontsAsync();
// Apple's system fonts only exist on Apple devices: Figma's renderer and collaborators on other
// machines can't draw them, so they're swapped for Inter (a close, Figma-hosted match).
const LOCAL_ONLY = /^(SF Pro|SF Compact|New York|\.SF)/;
function pickFamily() {
  for (const fam of [T.fontFamily, T.fontFamily.replace(/ Text$| Display$/, ""), "Inter"]) {
    if (LOCAL_ONLY.test(fam)) continue;
    if (available.some((f) => f.fontName.family === fam)) return fam;
  }
  return "Inter";
}
const FAMILY = pickFamily();
if (FAMILY !== T.fontFamily) notes.push("Font " + T.fontFamily + " isn't available here; used " + FAMILY);
const styleFor = (weight) => {
  const want = weight >= 700 ? ["Bold"] : weight >= 600 ? ["Semibold", "Semi Bold", "SemiBold"] : weight >= 500 ? ["Medium"] : ["Regular"];
  for (const w of want) if (available.some((f) => f.fontName.family === FAMILY && f.fontName.style === w)) return w;
  return "Regular";
};
const loaded = new Set();
async function font(weight) {
  const fn = { family: FAMILY, style: styleFor(weight) };
  const id = fn.family + fn.style;
  if (!loaded.has(id)) { await figma.loadFontAsync(fn); loaded.add(id); }
  return fn;
}
async function text(str, role, colorRole, opts) {
  opts = opts || {};
  const t = figma.createText();
  const ts = T.type[role];
  if (styles[role] && !opts.weight) {
    await figma.loadFontAsync(styles[role].fontName);
    t.textStyleId = styles[role].id;
  } else {
    t.fontName = await font(opts.weight || ts.weight);
    t.fontSize = ts.size;
    t.lineHeight = { unit: "PIXELS", value: ts.lineHeight };
  }
  t.characters = str || " ";
  t.fills = [paint(colorRole || "text")];
  if (opts.align) t.textAlignHorizontal = opts.align;
  return t;
}
function icon(name, colorRole, size) {
  const d = D.icons[name];
  if (!d) return null;
  const hex = (P[colorRole] || "#000000").slice(0, 7);
  const n = figma.createNodeFromSvg('<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="' + d + '" stroke="' + hex + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>');
  n.name = "icon/" + name;
  n.resize(size || 20, size || 20);
  return n;
}
function box(dir, props) {
  const f = figma.createAutoLayout(dir || "VERTICAL", props || {});
  f.fills = [];
  return f;
}
function fill(parent, child) {
  parent.appendChild(child);
  try { child.layoutSizingHorizontal = "FILL"; } catch (e) {}
  return child;
}
function wrapText(parent, t) {
  parent.appendChild(t);
  t.textAutoResize = "HEIGHT";
  try { t.layoutSizingHorizontal = "FILL"; } catch (e) {}
  return t;
}

// Library buttons (e.g. Material 3) keyed by variant.
const buttonSets = {};
for (const [variant, key] of Object.entries(D.buttonSets)) {
  try { buttonSets[variant] = await figma.importComponentSetByKeyAsync(key); } catch (e) { notes.push("button " + variant + ": " + e.message); }
}
const STATE_NAMES = { default: "Enabled", hover: "Hovered", focus: "Focused", pressed: "Pressed", disabled: "Disabled" };

async function button(n) {
  const variant = n.variant === "none" ? "secondary" : n.variant;
  const set = buttonSets[variant];
  if (set) {
    const want = STATE_NAMES[n.state] || "Enabled";
    const comp = set.children.find((c) => c.type === "COMPONENT" && c.name.includes("Size=Medium") && c.name.includes("Type=Round") && (c.name.includes("State=" + want) || (want === "Pressed" && c.name.includes("State=Presssed"))))
      || set.children.find((c) => c.type === "COMPONENT" && c.name.includes("State=" + want)) || set.defaultVariant;
    const inst = comp.createInstance();
    const defs = set.componentPropertyDefinitions;
    const props = {};
    for (const [k, d] of Object.entries(defs)) {
      if (d.type === "TEXT" && /label/i.test(k)) props[k] = n.text || " ";
      if (d.type === "BOOLEAN" && /show icon/i.test(k)) props[k] = false;
    }
    try { inst.setProperties(props); } catch (e) { notes.push("button text: " + e.message); }
    inst.name = "Button / " + variant + " / " + (n.text || "");
    return inst;
  }
  // Drawn button from theme tokens.
  const b = box("HORIZONTAL", { name: "Button / " + variant + " / " + (n.text || ""), itemSpacing: 8 });
  b.primaryAxisAlignItems = "CENTER";
  b.counterAxisAlignItems = "CENTER";
  b.paddingLeft = b.paddingRight = 20;
  b.minHeight = Math.max(T.minTarget, D.platform === "ios" ? 50 : T.minTarget);
  b.cornerRadius = D.platform === "ios" ? T.radius.lg : T.radius.full;
  const colors = { primary: ["primary", "onPrimary"], secondary: ["primaryContainer", "onPrimaryContainer"], tertiary: [null, "primary"], destructive: [null, "danger"] }[variant] || [null, "primary"];
  if (colors[0]) b.fills = [paint(colors[0])];
  if (n.icon) { const ic = icon(n.icon, colors[1], 18); if (ic) b.appendChild(ic); }
  b.appendChild(await text(n.text, "label", colors[1]));
  if (n.state === "disabled") b.opacity = 0.38;
  if (n.state === "focus") b.strokes = [paint("focus")], b.strokeWeight = 2;
  return b;
}

async function render(n, parent) {
  switch (n.k) {
    case "appbar": {
      const bar = box("VERTICAL", { name: "App bar", itemSpacing: 4 });
      const actions = box("HORIZONTAL", { name: "Actions", itemSpacing: 8 });
      actions.primaryAxisAlignItems = "MAX";
      for (const a of n.sub || []) { const ic = icon(n.icon || "plus", D.platform === "ios" ? "primary" : "textMuted", 24); if (ic) { ic.name = "icon/" + a; actions.appendChild(ic); } }
      if (D.platform === "ios") {
        fill(bar, actions);
        actions.minHeight = 32;
        bar.appendChild(await text(n.text, "display", "text"));
      } else {
        const row = box("HORIZONTAL", { name: "Top app bar", itemSpacing: 8 });
        row.counterAxisAlignItems = "CENTER";
        row.minHeight = 56;
        row.appendChild(await text(n.text, "headline", "text"));
        fill(row, actions);
        fill(bar, row);
      }
      return fill(parent, bar);
    }
    case "heading": return wrapText(parent, await text(n.text, D.platform === "ios" ? "title" : "headline", n.emphasis === "muted" ? "textMuted" : "text"));
    case "text": return wrapText(parent, await text(n.text, "body", n.emphasis === "muted" ? "textMuted" : "text"));
    case "button": return fill(parent, await button(n));
    case "input":
    case "select": {
      const f = box("VERTICAL", { name: "Field / " + (n.label || ""), itemSpacing: 6 });
      if (n.label) f.appendChild(await text(n.label, "label", n.state === "error" ? "danger" : "textMuted"));
      const inp = box("HORIZONTAL", { name: "Input", itemSpacing: 8 });
      inp.counterAxisAlignItems = "CENTER";
      inp.minHeight = T.minTarget;
      inp.paddingLeft = inp.paddingRight = 12;
      inp.cornerRadius = D.platform === "ios" ? T.radius.md : T.radius.sm;
      if (D.platform === "ios") inp.fills = [paint("surfaceAlt")];
      inp.strokes = n.state === "error" ? [paint("danger")] : D.platform === "ios" ? [] : [paint("border")];
      inp.strokeWeight = n.state === "error" ? 2 : 1;
      if (n.icon) { const ic = icon(n.icon, "textMuted", 18); if (ic) inp.appendChild(ic); }
      const v = await text(n.text || " ", "body", n.text ? "text" : "textMuted");
      inp.appendChild(v);
      v.layoutGrow = 1;
      if (n.k === "select") { const ic = icon("chevron-right", "textMuted", 16); if (ic) inp.appendChild(ic); }
      fill(f, inp);
      for (const h of n.sub || []) f.appendChild(await text(h, "caption", "danger"));
      return fill(parent, f);
    }
    case "list": {
      const l = box("VERTICAL", { name: "List" });
      if (D.platform === "ios") { l.fills = [paint("surface")]; l.cornerRadius = T.radius.lg; l.paddingLeft = 14; }
      for (let i = 0; i < n.rows.length; i++) {
        const r = n.rows[i];
        const row = box("HORIZONTAL", { name: "Row / " + r.title, itemSpacing: 12 });
        row.counterAxisAlignItems = "CENTER";
        row.minHeight = T.minTarget;
        row.paddingTop = row.paddingBottom = 8;
        row.paddingRight = 12;
        if (i < n.rows.length - 1) { row.strokes = [paint("border")]; row.strokeBottomWeight = 1; row.strokeTopWeight = 0; row.strokeLeftWeight = 0; row.strokeRightWeight = 0; }
        const lead = box("HORIZONTAL", { name: "Leading" });
        lead.resize(32, 32);
        lead.primaryAxisSizingMode = "FIXED"; lead.counterAxisSizingMode = "FIXED";
        lead.primaryAxisAlignItems = "CENTER"; lead.counterAxisAlignItems = "CENTER";
        lead.cornerRadius = 16;
        lead.fills = [paint("surfaceAlt")];
        const tone = r.icon === "check" ? "success" : r.icon === "clock" ? "primary" : "textMuted";
        const ic = icon(r.icon, tone, 18); if (ic) lead.appendChild(ic);
        row.appendChild(lead);
        const col = box("VERTICAL", { name: "Text" });
        col.appendChild(await text(r.title, "body", "text"));
        if (r.sub) col.appendChild(await text(r.sub, "caption", "textMuted"));
        row.appendChild(col);
        col.layoutGrow = 1;
        const ch = icon("chevron-right", "textMuted", 16); if (ch) row.appendChild(ch);
        fill(l, row);
      }
      return fill(parent, l);
    }
    case "card": {
      const c = box("HORIZONTAL", { name: "Card", itemSpacing: 12 });
      c.paddingLeft = c.paddingRight = c.paddingTop = c.paddingBottom = 16;
      c.cornerRadius = T.radius.lg;
      const strong = n.emphasis === "strong";
      c.fills = [paint(strong ? "primaryContainer" : D.platform === "ios" ? "surface" : "surfaceAlt")];
      const fg = strong ? "onPrimaryContainer" : "text";
      if (n.icon) {
        const disc = box("HORIZONTAL", { name: "Icon" });
        disc.resize(40, 40); disc.primaryAxisSizingMode = "FIXED"; disc.counterAxisSizingMode = "FIXED";
        disc.primaryAxisAlignItems = "CENTER"; disc.counterAxisAlignItems = "CENTER"; disc.cornerRadius = 20;
        disc.fills = [paint("primary")];
        const ic = icon(n.icon, "onPrimary", 22); if (ic) disc.appendChild(ic);
        c.appendChild(disc);
      }
      const col = box("VERTICAL", { name: "Content", itemSpacing: 2 });
      if (n.text) col.appendChild(await text(n.text.toUpperCase(), "caption", fg));
      for (let i = 0; i < (n.sub || []).length; i++) col.appendChild(await text(n.sub[i], i === 0 ? "headline" : "body", fg, i === 0 ? { weight: 700 } : undefined));
      c.appendChild(col);
      col.layoutGrow = 1;
      return fill(parent, c);
    }
    case "banner": {
      const tone = n.variant === "error" ? ["dangerContainer", "onDangerContainer", "error"] : n.variant === "warning" ? ["surfaceAlt", "text", n.icon || "warning"] : ["primaryContainer", "onPrimaryContainer", n.icon || "info"];
      const b = box("HORIZONTAL", { name: "Banner / " + n.variant, itemSpacing: 10 });
      b.paddingLeft = b.paddingRight = 14; b.paddingTop = b.paddingBottom = 12;
      b.cornerRadius = T.radius.md;
      b.fills = [paint(tone[0])];
      const ic = icon(tone[2], n.variant === "warning" ? "warning" : tone[1], 20); if (ic) b.appendChild(ic);
      const t = await text(n.text, "body", tone[1]);
      wrapText(b, t);
      return fill(parent, b);
    }
    case "empty": {
      const e = box("VERTICAL", { name: "Empty state", itemSpacing: 8 });
      e.counterAxisAlignItems = "CENTER";
      e.paddingTop = 36;
      const art = box("HORIZONTAL", { name: "Illustration" });
      art.resize(88, 88); art.primaryAxisSizingMode = "FIXED"; art.counterAxisSizingMode = "FIXED";
      art.primaryAxisAlignItems = "CENTER"; art.counterAxisAlignItems = "CENTER"; art.cornerRadius = 44;
      art.fills = [paint("primaryContainer")];
      const ic = icon(n.icon, "onPrimaryContainer", 36); if (ic) art.appendChild(ic);
      e.appendChild(art);
      wrapText(e, await text(n.text, D.platform === "ios" ? "title" : "headline", "text", { align: "CENTER" }));
      for (const s of n.sub || []) wrapText(e, await text(s, "body", "textMuted", { align: "CENTER" }));
      return fill(parent, e);
    }
    case "spinner": {
      const s = box("VERTICAL", { name: "Progress" });
      s.counterAxisAlignItems = "CENTER"; s.paddingTop = s.paddingBottom = 40;
      const ring = figma.createEllipse();
      ring.resize(32, 32);
      ring.fills = [];
      ring.strokes = [paint("primary")];
      ring.strokeWeight = 3;
      ring.arcData = { startingAngle: 0, endingAngle: 4.7, innerRadius: 0.82 };
      s.appendChild(ring);
      return fill(parent, s);
    }
    case "skeleton": {
      const s = box("VERTICAL", { name: "Skeleton", itemSpacing: 14 });
      s.paddingTop = 8;
      for (let i = 0; i < Number(n.text || 4); i++) {
        const bar = figma.createRectangle();
        bar.resize(140 + ((i * 37) % 160), 14);
        bar.cornerRadius = 7;
        bar.fills = [paint("surfaceAlt")];
        s.appendChild(bar);
      }
      return fill(parent, s);
    }
    case "chips": {
      const c = box("HORIZONTAL", { name: "Chips", itemSpacing: 8 });
      for (let i = 0; i < (n.sub || []).length; i++) {
        const chip = box("HORIZONTAL", { name: "Chip", itemSpacing: 6 });
        chip.counterAxisAlignItems = "CENTER";
        chip.minHeight = 32; chip.paddingLeft = chip.paddingRight = 14;
        chip.cornerRadius = D.platform === "ios" ? T.radius.full : T.radius.sm;
        if (i === 0) { chip.fills = [paint("primaryContainer")]; const ic = icon("check", "onPrimaryContainer", 14); if (ic) chip.appendChild(ic); }
        else { chip.strokes = [paint("border")]; chip.strokeWeight = 1; }
        chip.appendChild(await text(n.sub[i], "label", i === 0 ? "onPrimaryContainer" : "text"));
        c.appendChild(chip);
      }
      return fill(parent, c);
    }
    case "divider": {
      const r = figma.createRectangle(); r.resize(10, 1); r.fills = [paint("border")];
      return fill(parent, r);
    }
    case "row": {
      const r = box("HORIZONTAL", { name: "Row", itemSpacing: 8 });
      r.counterAxisAlignItems = "MAX";
      for (const c of n.children || []) { const child = await render(c, r); try { child.layoutSizingHorizontal = "FILL"; } catch (e) {} }
      return fill(parent, r);
    }
    case "stat": {
      const s = box("VERTICAL", { name: "Stat" });
      s.appendChild(await text(n.text || "", "headline", "text"));
      return fill(parent, s);
    }
    default:
      return null;
  }
}

// Auto-layout can leave a FILL child at zero width when it was sized before its siblings
// existed. Give growing columns and wrapping text an explicit width first, then FILL again.
function settle(root) {
  const growers = root.findAll((n) => n.type === "FRAME" && n.layoutGrow === 1 && n.parent && n.parent.layoutMode === "HORIZONTAL");
  for (const c of growers) {
    const p = c.parent;
    const others = p.children.filter((k) => k !== c).reduce((sum, k) => sum + k.width, 0);
    const avail = p.width - p.paddingLeft - p.paddingRight - others - p.itemSpacing * (p.children.length - 1);
    c.layoutSizingHorizontal = "FIXED";
    c.resize(Math.max(40, avail), c.height);
    c.layoutSizingHorizontal = "FILL";
  }
  for (const t of root.findAllWithCriteria({ types: ["TEXT"] })) {
    if (t.textAutoResize !== "HEIGHT" || !t.parent || t.parent.layoutMode === "NONE") continue;
    const p = t.parent;
    const others = p.layoutMode === "HORIZONTAL" ? p.children.filter((k) => k !== t).reduce((sum, k) => sum + k.width + p.itemSpacing, 0) : 0;
    t.layoutSizingHorizontal = "FIXED";
    t.resize(Math.max(40, p.width - p.paddingLeft - p.paddingRight - others), t.height);
    t.textAutoResize = "HEIGHT";
    t.layoutSizingHorizontal = "FILL";
  }
}

const TAB_ICONS = [[/today|home/i, "home"], [/history/i, "history"], [/family|people/i, "people"], [/setting/i, "settings"]];
async function tabbar(n) {
  const bar = box("HORIZONTAL", { name: "Tab bar" });
  bar.primaryAxisAlignItems = "SPACE_BETWEEN";
  bar.paddingLeft = bar.paddingRight = 20; bar.paddingTop = 8; bar.paddingBottom = D.platform === "android" ? 16 : 4;
  bar.fills = [paint(D.platform === "android" ? "surfaceAlt" : "background")];
  if (D.platform === "ios") { bar.strokes = [paint("border")]; bar.strokeTopWeight = 1; bar.strokeBottomWeight = 0; bar.strokeLeftWeight = 0; bar.strokeRightWeight = 0; }
  const match = (n.sub || []).findIndex((l) => l.toLowerCase() === D.screenName.toLowerCase());
  for (let i = 0; i < (n.sub || []).length; i++) {
    const label = n.sub[i];
    const item = box("VERTICAL", { name: "Tab / " + label, itemSpacing: 2 });
    item.counterAxisAlignItems = "CENTER";
    const active = i === (match === -1 ? 0 : match);
    const color = active ? (D.platform === "android" ? "onPrimaryContainer" : "primary") : "textMuted";
    const name = (TAB_ICONS.find((t) => t[0].test(label)) || [null, "more"])[1];
    const pill = box("HORIZONTAL", { name: "Indicator" });
    pill.paddingLeft = pill.paddingRight = D.platform === "android" ? 18 : 0; pill.paddingTop = pill.paddingBottom = D.platform === "android" ? 4 : 0;
    pill.cornerRadius = 16;
    if (active && D.platform === "android") pill.fills = [paint("primaryContainer")];
    const ic = icon(name, color, 24); if (ic) pill.appendChild(ic);
    item.appendChild(pill);
    item.appendChild(await text(label, "caption", active ? (D.platform === "android" ? "text" : "primary") : "textMuted", { weight: active ? 600 : 400 }));
    bar.appendChild(item);
  }
  return bar;
}

// ---- Section: one per screen/platform/mode, placed to the right of existing content ----
let section = figma.currentPage.children.find((n) => n.type === "SECTION" && n.name === D.sectionName);
if (section) { for (const c of [...section.children]) c.remove(); }
else {
  let maxX = 0;
  for (const c of figma.currentPage.children) maxX = Math.max(maxX, c.x + c.width);
  section = figma.createSection();
  section.name = D.sectionName;
  section.x = figma.currentPage.children.length > 1 ? maxX + 200 : 0;
  section.y = 0;
}
const W = D.platform === "android" ? 412 : D.platform === "ios" ? 393 : 1280;
const H = D.platform === "android" ? 917 : D.platform === "ios" ? 852 : 800;
const frames = [];
let x = 80;
for (const st of D.states) {
  const frame = figma.createFrame();
  frame.name = D.screenName + " — " + st.state;
  frame.resize(W, H);
  frame.layoutMode = "VERTICAL";
  frame.primaryAxisSizingMode = "FIXED";
  frame.counterAxisSizingMode = "FIXED";
  frame.clipsContent = true;
  frame.cornerRadius = D.platform === "web" ? 8 : 0;
  frame.fills = [paint("background")];
  if (collection && T.figma) {
    const m = collection.modes.find((mm) => mm.name === T.figma.modes[D.mode]);
    if (m) frame.setExplicitVariableModeForCollection(collection, m.modeId);
  }
  section.appendChild(frame);
  frame.x = x; frame.y = 120;
  x += W + 80;

  const status = box("HORIZONTAL", { name: "Status bar" });
  status.paddingLeft = status.paddingRight = 28; status.paddingTop = 14; status.paddingBottom = 10;
  status.appendChild(await text("9:41", "label", "text", { weight: 600 }));
  fill(frame, status);

  const nodes = st.nodes.filter((n) => n.k !== "tabbar" && n.k !== "sidebar");
  const tabs = st.nodes.filter((n) => n.k === "tabbar");
  let content;
  if (D.presentation === "sheet") {
    // Opaque background with a 32% black scrim on top (unbound: variable-bound paints lose their opacity).
    frame.fills = [paint("background"), { type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 0.32 }];
    const spacer = box("VERTICAL", { name: "Backdrop" });
    fill(frame, spacer); spacer.layoutGrow = 1;
    const sheet = box("VERTICAL", { name: "Sheet", itemSpacing: 12 });
    sheet.fills = [paint(D.platform === "android" ? "surfaceAlt" : "surface")];
    sheet.topLeftRadius = sheet.topRightRadius = 26;
    sheet.paddingLeft = sheet.paddingRight = 20; sheet.paddingTop = 10; sheet.paddingBottom = 40;
    const grab = figma.createRectangle(); grab.resize(36, 5); grab.cornerRadius = 3; grab.fills = [paint("textMuted", 0.5)];
    sheet.appendChild(grab);
    sheet.counterAxisAlignItems = "CENTER";
    fill(frame, sheet);
    content = sheet;
  } else {
    content = box("VERTICAL", { name: "Content", itemSpacing: 12 });
    content.paddingLeft = content.paddingRight = 16; content.paddingTop = 4; content.paddingBottom = 12;
    fill(frame, content);
    content.layoutGrow = 1;
  }
  for (const n of nodes) await render(n, content);
  for (const n of tabs) fill(frame, await tabbar(n));
  settle(frame);
  frames.push({ state: st.state, id: frame.id });
  created.push(frame.id);
}
section.resizeWithoutConstraints(x, H + 200);
return { sectionId: section.id, frames, font: FAMILY, boundVariables: Object.keys(vars).length, libraryButtons: Object.keys(buttonSets), notes };
`;

export function buildScreenScript(input: ScreenScriptInput): string {
  const data = {
    sectionName: input.sectionName,
    screenName: input.screenName,
    presentation: input.presentation,
    platform: input.platform,
    mode: input.mode,
    theme: input.theme,
    buttonSets: input.buttonSets,
    states: input.states,
    icons: ICON_PATHS,
  };
  return `const DATA = ${JSON.stringify(data)};\n${RUNTIME}`;
}

/** Grey theme used to push wireframes with the same generator. */
export function wireframeTheme(platform: Platform): Theme {
  const grey = {
    background: "#FAFAFA", surface: "#FFFFFF", surfaceAlt: "#E4E4E4", text: "#2F2F2F", textMuted: "#6B6B6B", primary: "#3B3B3B", onPrimary: "#FFFFFF",
    primaryContainer: "#E4E4E4", onPrimaryContainer: "#2F2F2F", border: "#CFCFCF", danger: "#3B3B3B", onDanger: "#FFFFFF",
    dangerContainer: "#EDEDED", onDangerContainer: "#2F2F2F", success: "#3B3B3B", warning: "#3B3B3B", focus: "#3B3B3B",
  };
  const ts = (size: number, lineHeight: number, weight: number) => ({ size, lineHeight, weight });
  return {
    platform, library: "Wireframe kit", fontFamily: "Inter", fallbackFont: "sans-serif",
    color: { light: grey, dark: grey },
    type: { display: ts(28, 34, 700), headline: ts(20, 26, 700), title: ts(17, 22, 600), body: ts(15, 20, 400), label: ts(15, 20, 600), caption: ts(13, 17, 400) },
    radius: { sm: 6, md: 8, lg: 12, full: 999 }, spacing: [4, 8, 12, 16], minTarget: 44, provenance: [],
  };
}

export interface ExportJob {
  label: string;
  screenId: string;
  platform: Platform;
  mode: Mode;
  code: string;
}

/** One script per screen × platform for a UI artifact. */
export function uiExportJobs(ui: UI, ds: DesignSystem, lookup: CopyLookup, opts: { platforms: Platform[]; mode: Mode; projectName: string }): ExportJob[] {
  const jobs: ExportJob[] = [];
  for (const platform of opts.platforms) {
    const theme = ds.themes.find((t) => t.platform === platform);
    if (!theme) continue;
    const buttonSets: Record<string, string> = {};
    if (theme.figma) {
      for (const c of ds.components) {
        if (c.platform === platform && c.block === "button" && c.componentKey && c.variant) buttonSets[c.variant] = c.componentKey;
      }
    }
    for (const s of ui.screens) {
      const label = `${s.name} · ${platform === "ios" ? "iOS" : platform === "android" ? "Android" : "Web"} · ${opts.mode}`;
      jobs.push({
        label, screenId: s.screenId, platform, mode: opts.mode,
        code: buildScreenScript({
          sectionName: `UX Studio — ${opts.projectName} — ${label}`,
          screenName: s.name, screenId: s.screenId, presentation: s.presentation,
          states: s.states.map((st) => ({ state: st.state, nodes: st.blocks.map((b) => toNode(b, lookup)) })),
          platform, mode: opts.mode, theme, buttonSets,
        }),
      });
    }
  }
  return jobs;
}

/** Wireframes pushed as grey frames, one script per screen. */
export function wireframeExportJobs(w: Wireframes, lookup: CopyLookup, opts: { platform: Platform; projectName: string }): ExportJob[] {
  return w.screens.map((s) => {
    const label = `${s.name} · wireframe`;
    const blocks = s.states.map((st) => ({
      state: st.state,
      nodes: st.blocks.map((b) => toNode({ ...b, icon: "none", emphasis: "normal", state: "default", a11yLabel: "", children: b.children.map((c) => ({ ...c, icon: "none", emphasis: "normal", state: "default", a11yLabel: "" })) } as UIBlockT, lookup)),
    }));
    return {
      label, screenId: s.screenId, platform: opts.platform, mode: "light" as Mode,
      code: buildScreenScript({
        sectionName: `UX Studio — ${opts.projectName} — ${label}`, screenName: s.name, screenId: s.screenId, presentation: "full",
        states: blocks, platform: s.form === "desktop" ? "web" : opts.platform, mode: "light", theme: wireframeTheme(opts.platform), buttonSets: {},
      }),
    };
  });
}
