import Link from "next/link";
import { listProjects } from "@/lib/storage/projects";
import { listSamples } from "@/lib/samples";
import { stageStates } from "@/lib/orchestrator/status";
import { isReplayMode } from "@/lib/runtime/models";
import { ProjectsClient } from "@/components/ProjectsClient";

export const dynamic = "force-dynamic";

export default async function Home() {
  const projects = await listProjects();
  const samples = await listSamples();
  const rows = await Promise.all(
    projects.map(async (p) => ({
      slug: p.slug,
      name: p.name,
      platforms: p.platforms,
      updatedAt: p.updatedAt,
      stages: (await stageStates(p.slug)).map((s) => s.status),
    })),
  );
  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand">UX Studio</Link>
        <span className="spacer" />
        <Link href="/agents">Agents</Link>
        {isReplayMode() && <span className="badge replay" title="No API key found: runs play back recorded sample output">Replay mode</span>}
        <span className="faint">Press <kbd>?</kbd> for shortcuts</span>
      </header>
      <main className="page narrow">
        <ProjectsClient projects={rows} samples={samples.map((s) => ({ id: s.id, name: s.name, platforms: s.platforms, brief: s.brief }))} />
      </main>
    </>
  );
}
