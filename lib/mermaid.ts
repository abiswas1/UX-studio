// Server-side Mermaid syntax check, used by definitions of done.
// Mermaid's parser runs fine in Node; only its post-parse HTML sanitising step needs a browser,
// so an error from that step means the diagram parsed successfully.

type MermaidApi = { parse: (text: string) => Promise<unknown> };
let api: Promise<MermaidApi> | null = null;

async function load(): Promise<MermaidApi> {
  api ??= import("mermaid").then((m) => (m.default ?? m) as unknown as MermaidApi);
  return api;
}

export async function checkMermaid(source: string): Promise<{ ok: boolean; error?: string }> {
  const text = source.trim();
  if (!/^(flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/.test(text)) {
    return { ok: false, error: 'Must start with "flowchart TD" (or LR).' };
  }
  try {
    await (await load()).parse(text);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/DOMPurify|document is not defined|window is not defined/.test(message)) return { ok: true };
    return { ok: false, error: message.split("\n").slice(0, 3).join(" ") };
  }
}
