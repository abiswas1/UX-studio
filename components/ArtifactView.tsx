import { ResearchView } from "@/agents/researcher/view";
import { ArchitectureView } from "@/agents/architect/view";
import { ContentView } from "@/agents/content/view";
import { WireframesView } from "@/agents/wireframer/view";
import { DesignSystemView } from "@/agents/design-system/view";
import { UIView } from "@/agents/ui/view";
import { CritiqueView } from "@/agents/critic/view";
import { PrototypeView } from "@/agents/prototyper/view";
import type { Critique } from "@/agents/critic/schema";
import type { Prototype } from "@/agents/prototyper/schema";
import type { DesignSystem } from "@/agents/design-system/schema";
import type { UI } from "@/agents/ui/schema";
import type { Research } from "@/agents/researcher/schema";
import type { Architecture } from "@/agents/architect/schema";
import type { Content } from "@/agents/content/schema";
import type { Wireframes } from "@/agents/wireframer/schema";
import type { CopyLookup } from "./Wireframe";

export interface ViewContext {
  platforms: string[];
  /** Copy from the content version this artifact was built from (for wireframes and UI). */
  lookup?: CopyLookup;
  /** Design system version the UI was built from. */
  designSystem?: DesignSystem | null;
  slug: string;
  version: number;
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
    case "design-system":
      return <DesignSystemView data={data as DesignSystem} />;
    case "ui":
      return <UIView data={data as UI} lookup={context.lookup ?? { strings: {}, errors: {} }} designSystem={context.designSystem ?? null} platforms={context.platforms} />;
    case "critique":
      return <CritiqueView data={data as Critique} />;
    case "prototype":
      return <PrototypeView data={data as Prototype} slug={context.slug} version={context.version} />;
    default:
      return <pre className="live">{JSON.stringify(data, null, 2)}</pre>;
  }
}

export { copyLookup } from "@/lib/copy";
