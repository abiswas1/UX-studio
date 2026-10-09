import type { z } from "zod";
import type { DodResult, ArtifactVersion } from "../storage/artifacts";
import type { Project } from "../storage/projects";
import type { StageId } from "../stages";

export interface AgentContext {
  project: Project;
  brief: string;
  uploads: string[];
  projectDir: string;
  /** Approved (or latest) versions of the stages this one depends on. */
  upstream: Partial<Record<StageId, ArtifactVersion>>;
  /** Set when re-running to address feedback, e.g. critique findings or the designer's notes. */
  revision?: { previous: unknown; notes: string };
}

export interface SubagentDef {
  description: string;
  prompt: string;
  tools: string[];
}

export interface AgentModule<T = unknown> {
  id: string;
  stage: StageId;
  schema: z.ZodType<T>;
  /** Built-in tools the agent may use besides submit_artifact. */
  tools: string[];
  /** Figma MCP tools (without prefix) the agent may use when the project has a Figma file. */
  figmaTools?: string[];
  subagents?: (ctx: AgentContext) => Record<string, SubagentDef>;
  buildTask: (ctx: AgentContext) => string;
  dod: (data: T, ctx: AgentContext) => DodResult | Promise<DodResult>;
  toMarkdown: (data: T) => string;
  /** Assumptions and open questions to merge into shared project state. */
  extractState: (data: T) => { assumptions: string[]; questions: string[] };
  /** Runs after a version is saved (by an agent or by hand), e.g. to build export files. */
  afterSave?: (slug: string, version: number) => Promise<void>;
}
