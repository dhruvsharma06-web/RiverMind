"use client";
import { useEffect, useRef, useState } from "react";
import { Waves } from "lucide-react";
export function LandingWelcome() {
  const [dismissed, setDismissed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (dismissed) return;
    const timer = window.setTimeout(
      () => setDismissed(true),
      matchMedia("(prefers-reduced-motion: reduce)").matches ? 240 : 1600,
    );
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDismissed(true);
    };
    const focus = (event: FocusEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setDismissed(true);
    };
    window.addEventListener("keydown", escape);
    document.addEventListener("focusin", focus);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", escape);
      document.removeEventListener("focusin", focus);
    };
  }, [dismissed]);
  if (dismissed) return null;
  return (
    <>
      <div
        ref={root}
        className="landing-welcome"
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) setDismissed(true);
        }}
      >
        <div role="status" className="welcome-identity">
          <Waves size={34} strokeWidth={1.25} aria-hidden="true" />
          <p>Introducing</p>
          <strong>
            RiverMind<span>.</span>
          </strong>
        </div>
        <button className="welcome-skip" onClick={() => setDismissed(true)}>
          Skip intro
        </button>
      </div>
      <noscript>
        <style>{`.landing-welcome{display:none}`}</style>
      </noscript>
    </>
  );
}
