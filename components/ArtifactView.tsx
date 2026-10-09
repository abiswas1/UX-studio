import { ResearchView } from "@/agents/researcher/view";
import type { Research } from "@/agents/researcher/schema";

/** Rendered view for a stage's artifact. Stages without a custom view fall back to JSON. */
export function ArtifactView({ stage, data }: { stage: string; data: unknown }) {
  switch (stage) {
    case "research":
      return <ResearchView data={data as Research} />;
    default:
      return <pre className="live">{JSON.stringify(data, null, 2)}</pre>;
  }
}
