// The pipeline: eight stages in order, each owned by one specialist agent.
// `dependsOn` drives staleness: a stage is out of date when anything it was built from has changed.

export type StageId =
  | "research"
  | "architecture"
  | "content"
  | "wireframes"
  | "design-system"
  | "ui"
  | "critique"
  | "prototype";

export interface StageDef {
  id: StageId;
  order: number;
  folder: string;
  title: string;
  agent: string;
  summary: string;
  dependsOn: StageId[];
  /** Phase in which this stage becomes available. */
  phase: "a" | "b" | "c" | "d";
}

export const STAGES: StageDef[] = [
  { id: "research", order: 1, folder: "01-research", title: "Research", agent: "researcher", phase: "a",
    summary: "Problem framing, competitors, personas, jobs-to-be-done, insights, How might we",
    dependsOn: [] },
  { id: "architecture", order: 2, folder: "02-architecture", title: "Architecture", agent: "architect", phase: "b",
    summary: "Journeys, task flows, sitemap, screen inventory", dependsOn: ["research"] },
  { id: "content", order: 3, folder: "03-content", title: "Content", agent: "content", phase: "b",
    summary: "UX copy, microcopy, error messages", dependsOn: ["architecture", "research"] },
  { id: "wireframes", order: 4, folder: "04-wireframes", title: "Wireframes", agent: "wireframer", phase: "b",
    summary: "Low-fi screens, one primary action each", dependsOn: ["architecture", "content"] },
  { id: "design-system", order: 5, folder: "05-design-system", title: "Design system", agent: "design-system", phase: "c",
    summary: "Your Figma library or tokens, or a minimal system", dependsOn: ["wireframes"] },
  { id: "ui", order: 6, folder: "06-ui", title: "UI", agent: "ui", phase: "c",
    summary: "High-fi screens in every interactive state", dependsOn: ["wireframes", "content", "design-system", "architecture"] },
  { id: "critique", order: 7, folder: "07-critique", title: "Critique", agent: "critic", phase: "d",
    summary: "Nielsen heuristics and WCAG 2.2 AA review", dependsOn: ["ui", "wireframes", "content"] },
  { id: "prototype", order: 8, folder: "08-prototype", title: "Prototype", agent: "prototyper", phase: "d",
    summary: "Clickable prototype and handoff spec", dependsOn: ["ui", "architecture", "critique"] },
];

/** Phases built so far. Stages from later phases show as "coming soon". */
export const AVAILABLE_PHASES = new Set(["a", "b", "c"]);

export function stageById(id: string): StageDef | undefined {
  return STAGES.find((s) => s.id === id);
}

export function isAvailable(stage: StageDef): boolean {
  return AVAILABLE_PHASES.has(stage.phase);
}
