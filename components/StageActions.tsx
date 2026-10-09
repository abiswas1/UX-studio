"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useHotkeys } from "./useHotkeys";

export function StageActions({ slug, stage, version, isLatest, isApproved, dodPassed, tab }: {
  slug: string; stage: string; version: number; isLatest: boolean; isApproved: boolean; dodPassed: boolean; tab: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const approve = async (override = false) => {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/projects/${slug}/stages/${stage}/approve`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version, override }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json()).error ?? "Could not approve");
    router.refresh();
  };

  useHotkeys({
    a: () => !isApproved && dodPassed && approve(),
    e: () => router.push(`/p/${slug}/${stage}?v=${version}&tab=edit`),
    h: () => router.push(`/p/${slug}/${stage}?v=${version}&tab=history`),
    v: () => router.push(`/p/${slug}/${stage}?v=${version}`),
    Escape: () => tab !== "view" && router.push(`/p/${slug}/${stage}?v=${version}`),
  });

  return (
    <div className="row">
      {error && <span className="notice bad" role="alert">{error}</span>}
      {isApproved ? (
        <span className="chip good">Version {version} approved</span>
      ) : dodPassed ? (
        <button className="primary" onClick={() => approve()} disabled={busy}>
          Approve version {version}{!isLatest ? " (older)" : ""} <kbd>a</kbd>
        </button>
      ) : (
        <button onClick={() => confirm("Approve even though some done-checks failed? This is recorded in the decision log.") && approve(true)} disabled={busy}>
          Approve anyway
        </button>
      )}
    </div>
  );
}
