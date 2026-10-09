// Builds the clickable prototype: one self-contained HTML file with every screen state rendered
// by the same components the app uses, per platform and light/dark mode, wired with the
// Prototyper's links. Written to exports/prototype/index.html, plus exports/handoff.md.
import fs from "node:fs/promises";
import path from "node:path";
import { createElement } from "react";
import { UIScreen, type Mode, type Platform } from "../../components/UIRender";
import { getProject } from "../storage/projects";
import { getVersion, getMarkdown } from "../storage/artifacts";
import { projectDir } from "../storage/paths";
import { writeFileAtomic } from "../storage/fs";
import { copyLookup } from "../copy";
import type { Prototype } from "../../agents/prototyper/schema";
import type { UI } from "../../agents/ui/schema";
import type { DesignSystem } from "../../agents/design-system/schema";
import type { Content } from "../../agents/content/schema";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function buildPrototypeHtml(opts: { title: string; proto: Prototype; ui: UI; ds: DesignSystem; content: Content | null; platforms: string[] }): Promise<string> {
  const { proto, ui, ds } = opts;
  // Loaded at runtime (not bundled): Next.js refuses react-dom/server in the app graph, but
  // this is static HTML for an export file, not a page.
  const { renderToStaticMarkup } = (await import(/* webpackIgnore: true */ "react-dom/server")) as typeof import("react-dom/server");
  const lookup = copyLookup(opts.content);
  const platforms = ds.themes.map((t) => t.platform).filter((p) => opts.platforms.includes(p)) as Platform[];
  const templates: string[] = [];
  for (const platform of platforms) {
    const theme = ds.themes.find((t) => t.platform === platform)!;
    for (const mode of ["light", "dark"] as Mode[]) {
      for (const s of ui.screens) {
        for (const st of s.states) {
          const html = renderToStaticMarkup(createElement(UIScreen, { blocks: st.blocks, lookup, theme, mode, platform, presentation: s.presentation, screenName: s.name }));
          templates.push(`<template id="${esc(`${platform}|${mode}|${s.screenId}|${st.state}`)}">${html}</template>`);
        }
      }
    }
  }
  const css = await fs.readFile(path.join(process.cwd(), "app", "ui-kit.css"), "utf8");
  const data = {
    entry: proto.entry,
    links: proto.links,
    screens: ui.screens.map((s) => ({ id: s.screenId, name: s.name, states: s.states.map((st) => st.state) })),
    platforms,
  };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)} — prototype</title>
<style>
:root { --border: #d9d7d0; --sans: ui-sans-serif, -apple-system, "Segoe UI", Inter, Roboto, sans-serif; --mono: ui-monospace, Menlo, monospace; }
* { box-sizing: border-box; }
body { margin: 0; font-family: var(--sans); background: #e9e8e4; color: #1d1d1b; display: grid; grid-template-columns: 260px 1fr; min-height: 100vh; }
@media (prefers-color-scheme: dark) { body { background: #111; color: #eee; } aside { background: #1b1b1a !important; border-color: #333 !important; } aside button { background: #222; color: #eee; border-color: #444; } }
aside { background: #f7f6f3; border-right: 1px solid var(--border); padding: 16px; overflow: auto; max-height: 100vh; position: sticky; top: 0; }
aside h1 { font-size: 15px; margin: 0 0 4px; }
aside p { font-size: 12px; opacity: .7; margin: 0 0 12px; }
aside h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; opacity: .6; margin: 16px 0 6px; }
aside ul { list-style: none; padding: 0; margin: 0; font-size: 13px; }
aside li button { all: unset; cursor: pointer; display: block; padding: 3px 6px; border-radius: 5px; width: 100%; }
aside li button[aria-current="true"] { background: #3d5afe; color: #fff; }
aside li button:focus-visible { outline: 2px solid #3d5afe; }
.seg { display: flex; gap: 4px; flex-wrap: wrap; }
.seg button { font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border); background: #fff; cursor: pointer; }
.seg button[aria-pressed="true"] { background: #1d1d1b; color: #fff; }
main { display: grid; place-items: center; padding: 24px; }
#stage [data-copy] { cursor: default; }
#stage .linked { cursor: pointer; }
#stage.hints .linked > * , #stage.hints .linked:not([style]) { outline: 2px solid rgba(61,90,254,.85); outline-offset: 2px; border-radius: 8px; }
#stage.flash .linked > *, #stage.flash .linked:not([style]) { outline: 2px solid rgba(61,90,254,.85); outline-offset: 2px; transition: outline-color .6s; }
.where { font-size: 12px; opacity: .7; margin-top: 10px; text-align: center; }
${css}
</style>
</head>
<body>
<aside>
  <h1>${esc(opts.title)}</h1>
  <p>Click highlighted elements to move through the flows. Press <b>H</b> to show hotspots, <b>←</b> to go back.</p>
  <h2>Platform</h2><div class="seg" id="platforms"></div>
  <h2>Appearance</h2><div class="seg" id="modes"><button data-mode="light">Light</button><button data-mode="dark">Dark</button></div>
  <h2>Screens</h2><ul id="nav"></ul>
</aside>
<main><div><div id="stage" role="region" aria-live="polite"></div><div class="where" id="where"></div></div></main>
${templates.join("\n")}
<script>
const D = ${JSON.stringify(data)};
let cur = { platform: D.platforms[0], mode: "light", screen: D.entry.screenId, state: D.entry.state };
const history = [];
const stage = document.getElementById("stage");
let autoTimer = null;
function linksFor(screen, state) { return D.links.filter((l) => l.from.screenId === screen && (l.from.state === state || l.from.state === "*")); }
function go(screen, state, push = true) {
  if (push) history.push({ screen: cur.screen, state: cur.state });
  cur.screen = screen; cur.state = state; render();
}
function render() {
  clearTimeout(autoTimer);
  const t = document.getElementById([cur.platform, cur.mode, cur.screen, cur.state].join("|"));
  stage.innerHTML = t ? t.innerHTML : "<p>Missing screen " + cur.screen + "/" + cur.state + "</p>";
  const links = linksFor(cur.screen, cur.state);
  for (const l of links.filter((x) => x.trigger === "tap")) {
    stage.querySelectorAll('[data-copy="' + CSS.escape(l.element) + '"]').forEach((el) => {
      el.classList.add("linked");
      el.setAttribute("tabindex", "0");
      el.addEventListener("click", (e) => { e.stopPropagation(); go(l.to.screenId, l.to.state); });
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(l.to.screenId, l.to.state); } });
    });
  }
  const auto = links.find((x) => x.trigger === "auto");
  if (auto) autoTimer = setTimeout(() => go(auto.to.screenId, auto.to.state, false), 1400);
  document.getElementById("where").textContent = D.screens.find((s) => s.id === cur.screen).name + " · " + cur.state;
  document.querySelectorAll("#nav button").forEach((b) => b.setAttribute("aria-current", String(b.dataset.screen === cur.screen && b.dataset.state === cur.state)));
  document.querySelectorAll("#platforms button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.platform === cur.platform)));
  document.querySelectorAll("#modes button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === cur.mode)));
}
stage.addEventListener("click", () => { stage.classList.add("flash"); setTimeout(() => stage.classList.remove("flash"), 700); });
document.getElementById("platforms").innerHTML = D.platforms.map((p) => '<button data-platform="' + p + '">' + ({ ios: "iOS", android: "Android", web: "Web" }[p]) + "</button>").join("");
document.querySelectorAll("#platforms button").forEach((b) => b.addEventListener("click", () => { cur.platform = b.dataset.platform; render(); }));
document.querySelectorAll("#modes button").forEach((b) => b.addEventListener("click", () => { cur.mode = b.dataset.mode; render(); }));
document.getElementById("nav").innerHTML = D.screens.map((s) => s.states.map((st) => '<li><button data-screen="' + s.id + '" data-state="' + st + '">' + s.name + " · " + st + "</button></li>").join("")).join("");
document.querySelectorAll("#nav button").forEach((b) => b.addEventListener("click", () => go(b.dataset.screen, b.dataset.state)));
document.addEventListener("keydown", (e) => {
  if (e.key === "h" || e.key === "H") stage.classList.toggle("hints");
  if (e.key === "ArrowLeft" || e.key === "Backspace") { const p = history.pop(); if (p) go(p.screen, p.state, false); }
});
render();
</script>
</body>
</html>`;
}

/** Build exports/prototype/index.html and exports/handoff.md for a saved prototype version. */
export async function buildPrototypeFiles(slug: string, version: number): Promise<void> {
  const project = await getProject(slug);
  const proto = await getVersion<Prototype>(slug, "prototype", version);
  if (!project || !proto) return;
  const ui = await getVersion<UI>(slug, "ui", Number(proto.meta.inputs.ui));
  if (!ui) return;
  const ds = await getVersion<DesignSystem>(slug, "design-system", Number(ui.meta.inputs["design-system"]));
  const content = await getVersion<Content>(slug, "content", Number(ui.meta.inputs.content));
  if (!ds) return;
  const html = await buildPrototypeHtml({ title: project.name, proto: proto.data, ui: ui.data, ds: ds.data, content: content?.data ?? null, platforms: project.platforms });
  const dir = path.join(projectDir(slug), "exports");
  await writeFileAtomic(path.join(dir, "prototype", "index.html"), html);
  const md = await getMarkdown(slug, "prototype", version);
  if (md) await writeFileAtomic(path.join(dir, "handoff.md"), md.replace(/^<!--.*-->\n\n/, ""));
}
