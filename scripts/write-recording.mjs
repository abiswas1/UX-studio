// Wraps an agent's output into a replay recording (fixtures/replay/<agent>/<sample>[.r<round>].json).
//
//   node scripts/write-recording.mjs <agent> <sampleId> <output.json> <narration.txt> [round] [--model draft|strong] [--tools tools.json]
//
// narration.txt is the short text the agent "streams" while working. tools.json (optional) is a list of
// {name, summary} tool calls (e.g. WebSearch queries) played before the final submit.
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(`--${n}`); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
const tier = flag("model");
const toolsFile = flag("tools");
const [agent, sample, outFile, narrationFile, round] = args;
if (!agent || !sample || !outFile || !narrationFile) {
  console.error("usage: write-recording.mjs <agent> <sampleId> <output.json> <narration.txt> [round] [--model draft|strong] [--tools tools.json]");
  process.exit(2);
}
const models = JSON.parse(fs.readFileSync(path.join("config", "models.json"), "utf8"));
const model = models.tiers[tier ?? models.agents?.[agent] ?? "strong"] ?? models.tiers.strong;
const output = JSON.parse(fs.readFileSync(outFile, "utf8"));
const words = (s) => s.match(/\S+\s*|\n+/g) ?? [];
const events = [];
const narration = fs.readFileSync(narrationFile, "utf8").trim().split(/\n\s*\n/);
const tools = toolsFile ? JSON.parse(fs.readFileSync(toolsFile, "utf8")) : [];
narration.forEach((para, i) => {
  for (const w of words(para + "\n\n")) events.push({ kind: "text", text: w, delayMs: 30 });
  if (i === 0) for (const t of tools) events.push({ kind: "tool", name: t.name, summary: t.summary ?? "", delayMs: 600 });
});
events.push({ kind: "tool", name: "submit_artifact", summary: "", delayMs: 800 });
const file = path.join("fixtures", "replay", agent, `${sample}${round && round !== "0" ? `.r${round}` : ""}.json`);
fs.mkdirSync(path.dirname(file), { recursive: true });
const note = `Recorded sample output for demos and tests, written for the ${sample} sample brief.`;
fs.writeFileSync(file, JSON.stringify({ note, model, costUsd: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, events, output }, null, 2) + "\n");
console.log(`wrote ${file}`);
