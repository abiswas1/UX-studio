"use client";
import { useEffect, useRef } from "react";

/** Single-key shortcuts, ignored while typing in a field or when a modifier is held. */
export function useHotkeys(map: Record<string, (e: KeyboardEvent) => void>): void {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) {
        if (e.key === "Escape") t.blur();
        return;
      }
      const fn = ref.current[e.key];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
