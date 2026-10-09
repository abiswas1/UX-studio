import { ResearchView } from "@/agents/researcher/view";
import { ArchitectureView } from "@/agents/architect/view";
import { ContentView } from "@/agents/content/view";
import { WireframesView } from "@/agents/wireframer/view";
import type { Research } from "@/agents/researcher/schema";
import type { Architecture } from "@/agents/architect/schema";
import type { Content } from "@/agents/content/schema";
import type { Wireframes } from "@/agents/wireframer/schema";
import type { CopyLookup } from "./Wireframe";

export interface ViewContext {
  platforms: string[];
  /** Copy from the content version this artifact was built from (for wireframes and UI). */
  lookup?: CopyLookup;
}

/** Rendered view for a stage's artifact. Stages without a custom view fall back to JSON. */
export function ArtifactView({ stage, data, context }: { stage: string; data: unknown; context: ViewContext }) {
  switch (stage) {
    case "research":
      return <ResearchView data={data as Research} />;
    case "architecture":
      return <ArchitectureView data={data as Architecture} />;
    case "content":
      return <ContentView data={data as Content} />;
    case "wireframes":
      return <WireframesView data={data as Wireframes} lookup={context.lookup ?? { strings: {}, errors: {} }} platforms={context.platforms} />;
    default:
      return <pre className="live">{JSON.stringify(data, null, 2)}</pre>;
  }
}

export function copyLookup(content: Content | null | undefined): CopyLookup {
  if (!content) return { strings: {}, errors: {} };
  return {
    strings: Object.fromEntries(content.screens.flatMap((s) => s.strings.map((x) => [x.key, x.text]))),
    errors: Object.fromEntries(content.errors.map((e) => [e.id, e.message])),
  };
}
