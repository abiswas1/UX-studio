import { z } from "zod";
import { query, tool, createSdkMcpServer, type AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { Provider, ProviderRequest, ProviderResult } from "./provider";

// Live provider: runs an agent through the Claude Agent SDK. The agent finishes by calling
// submit_artifact; its input is validated against the agent's output schema, and validation
// errors go back to the agent so it can correct them in the same session.

const SUBMIT = "mcp__uxstudio__submit_artifact";
export const FIGMA_PREFIX = `mcp__${process.env.UXSTUDIO_FIGMA_SERVER || "figma"}__`;

function summarise(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const o = input as Record<string, unknown>;
  const v = o.query ?? o.url ?? o.file_path ?? o.pattern ?? o.description ?? o.subagent_type;
  return typeof v === "string" ? v.slice(0, 140) : "";
}

export const sdkProvider: Provider = {
  async run(req: ProviderRequest): Promise<ProviderResult> {
    const started = Date.now();
    let output: unknown = null;

    const shape = (req.schema as z.ZodObject<z.ZodRawShape>).shape;
    const submit = tool(
      "submit_artifact",
      "Submit your finished work for this stage. Call it once, with the complete result. If it returns errors, fix them and call it again.",
      shape,
      async (args) => {
        const parsed = req.schema.safeParse(args);
        if (!parsed.success) {
          const issues = parsed.error.issues.map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
          return { content: [{ type: "text", text: `The submission has problems. Fix these and submit again:\n${issues}` }], isError: true };
        }
        output = parsed.data;
        return { content: [{ type: "text", text: "Saved. Your work for this stage is complete; stop here." }] };
      },
    );

    const agents: Record<string, AgentDefinition> = {};
    for (const [name, def] of Object.entries(req.subagents)) {
      agents[name] = { description: def.description, prompt: def.prompt, tools: def.tools, model: req.model };
    }
    const builtIns = req.tools.filter((t) => t !== "Agent" || Object.keys(agents).length > 0);
    // Figma tools come from the Figma MCP server configured in the user's Claude Code settings
    // (claude mcp add --scope user --transport http figma https://mcp.figma.com/mcp).
    const figma = req.figmaTools.map((t) => `${FIGMA_PREFIX}${t}`);

    const abortController = new AbortController();
    req.signal.addEventListener("abort", () => abortController.abort(), { once: true });

    let costUsd = 0;
    const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    let error: string | undefined;

    try {
      const stream = query({
        prompt: req.task,
        options: {
          systemPrompt: req.systemPrompt,
          model: req.model,
          cwd: req.cwd,
          tools: builtIns,
          allowedTools: [...builtIns, ...figma, SUBMIT],
          permissionMode: "dontAsk",
          mcpServers: { uxstudio: createSdkMcpServer({ name: "uxstudio", version: "0.1.0", tools: [submit] }) },
          agents,
          maxTurns: req.maxTurns,
          maxBudgetUsd: req.maxBudgetUsd,
          includePartialMessages: true,
          settingSources: figma.length ? ["user"] : [],
          persistSession: false,
          abortController,
        },
      });

      for await (const msg of stream) {
        if (msg.type === "stream_event" && msg.parent_tool_use_id === null) {
          const ev = msg.event;
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") req.onEvent({ kind: "text", text: ev.delta.text });
        } else if (msg.type === "assistant") {
          for (const block of msg.message.content) {
            if (block.type === "tool_use") {
              const name = block.name === SUBMIT ? "submit_artifact" : block.name.replace(FIGMA_PREFIX, "figma:");
              req.onEvent({ kind: "tool", name, summary: summarise(block.input) });
            }
          }
        } else if (msg.type === "result") {
          costUsd = msg.total_cost_usd;
          for (const u of Object.values(msg.modelUsage ?? {})) {
            tokens.input += u.inputTokens;
            tokens.output += u.outputTokens;
            tokens.cacheRead += u.cacheReadInputTokens;
            tokens.cacheWrite += u.cacheCreationInputTokens;
          }
          if (msg.subtype !== "success") error = `Agent stopped: ${msg.subtype.replace(/_/g, " ")}`;
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    if (output === null && !error) error = "The agent finished without submitting its work.";
    return {
      output,
      error: output === null ? error : undefined,
      costUsd,
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      cacheReadTokens: tokens.cacheRead,
      cacheWriteTokens: tokens.cacheWrite,
      durationMs: Date.now() - started,
      model: req.model,
      replay: false,
    };
  },
};
