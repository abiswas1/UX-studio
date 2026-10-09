"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function CritiqueLoopButton({ slug, serious, round }: { slug: string; serious: number; round: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const start = async () => {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/projects/${slug}/critique-loop`, { method: "POST" });
    setBusy(false);
    if (!res.ok) return setError((await res.json()).error ?? "Couldn't start");
    router.push(`/p/${slug}`);
  };
  return (
    <div className="card">
      <h3>Serious issues</h3>
      {serious === 0 ? (
        <p className="faint" style={{ margin: 0 }}>No severity 3 or 4 findings.</p>
      ) : (
        <>
          <p style={{ margin: "0 0 8px", fontSize: 14 }}>
            {serious} finding{serious === 1 ? "" : "s"} at severity 3–4. Send them back to the stages that own them; those stages re-run with the findings, then the Critic reviews again.
          </p>
          <button className="primary" onClick={start} disabled={busy || round >= 2}>{busy ? "Starting…" : `Send back (round ${round + 1} of 2)`}</button>
          {round >= 2 && <p className="faint" style={{ margin: "6px 0 0" }}>Both rounds used. Fix the rest by hand or approve them as known issues.</p>}
          {error && <div className="notice bad" style={{ marginTop: 8 }}>{error}</div>}
        </>
      )}
    </div>
  );
}
