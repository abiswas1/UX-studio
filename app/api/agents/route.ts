import { listAgentSettings, readPromptHistory, updateModels, updatePrompt } from "@/lib/agents/settings";
import { handle, ok } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url);
    const agent = url.searchParams.get("agent");
    const history = url.searchParams.get("history");
    if (agent && history) return ok({ raw: await readPromptHistory(agent, history) });
    return ok({ agents: await listAgentSettings() });
  });
}

// { agent, raw } saves instructions; { agent, tier } picks a model tier; { tiers } / { budgetUsdPerRun } change defaults.
export async function PATCH(req: Request) {
  return handle(async () => {
    const body = await req.json();
    if (typeof body.raw === "string") await updatePrompt(body.agent, body.raw);
    else await updateModels(body);
    return ok({ agents: await listAgentSettings() });
  });
}
