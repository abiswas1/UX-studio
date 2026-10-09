import type { Content } from "../agents/content/schema";
import type { CopyLookup } from "../components/Wireframe";

/** Key → text lookup for a content deck, plus error id → message. */
export function copyLookup(content: Content | null | undefined): CopyLookup {
  if (!content) return { strings: {}, errors: {} };
  return {
    strings: Object.fromEntries(content.screens.flatMap((s) => s.strings.map((x) => [x.key, x.text]))),
    errors: Object.fromEntries(content.errors.map((e) => [e.id, e.message])),
  };
}
