"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Waves } from "lucide-react";

/** A brief brand introduction, independent of API or asset loading. */
export function LandingWelcome() {
  const [dismissed, setDismissed] = useState(false);
  const screen = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const timer = window.setTimeout(
      () => setDismissed(true),
      preference.matches ? 240 : 2500,
    );
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setDismissed(true);
    }
    function onFocus(event: FocusEvent) {
      // Keyboard navigation can immediately continue into the page.
      if (
        event.target instanceof Node &&
        !screen.current?.contains(event.target)
      ) {
        setDismissed(true);
      }
    }
    window.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocus);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocus);
    };
  }, []);

  if (dismissed) return null;

  return (
    <>
      <div
        ref={screen}
        className="landing-welcome"
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) setDismissed(true);
        }}
      >
        <div className="welcome-identity" role="status" aria-live="polite">
          <div className="welcome-wave" aria-hidden="true">
            <Waves size={52} strokeWidth={1.2} />
          </div>
          <p className="welcome-introducing">Introducing</p>
          <p className="welcome-name">
            RiverMind<span>.</span>
          </p>
        </div>
        <button
          type="button"
          className="welcome-skip"
          onClick={() => setDismissed(true)}
        >
          Skip intro <ArrowRight size={13} aria-hidden="true" />
        </button>
      </div>
      <noscript>
        <style>{`.landing-welcome { display: none; }`}</style>
      </noscript>
    </>
  );
}
