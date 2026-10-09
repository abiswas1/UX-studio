import Link from "next/link";
import { listAgentSettings } from "@/lib/agents/settings";
import { isReplayMode, loadModelConfig } from "@/lib/runtime/models";
import { AgentsClient } from "@/components/AgentsClient";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const agents = await listAgentSettings();
  const cfg = loadModelConfig();
  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand">UX Studio</Link>
        <nav className="crumbs" aria-label="Breadcrumb"><span>/</span><span>Agents</span></nav>
        <span className="spacer" />
        <span className="faint">Press <kbd>?</kbd> for shortcuts</span>
      </header>
      <main className="page">
        <h1 style={{ marginTop: 0 }}>Agents</h1>
        <p className="faint" style={{ marginTop: -6 }}>Each specialist&apos;s instructions and model. Changes apply to the next run, in every project.</p>
        <AgentsClient agents={agents} tiers={cfg.tiers} budget={cfg.budgetUsdPerRun} replay={isReplayMode()} />
      </main>
    </>
  );
}
