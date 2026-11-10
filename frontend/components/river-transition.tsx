"use client";

import { useEffect, useRef } from "react";

const RISE_MS = 560;
const CLEAR_MS = 680;
const EASE_IN = "cubic-bezier(0.65, 0, 0.35, 1)";
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const BELOW = "translate3d(0, calc(100vh + 120px), 0)";
const COVER = "translate3d(0, 0, 0)";
const ABOVE = "translate3d(0, calc(-100vh - 120px), 0)";

/**
 * Hero to first section in one move. From the hero, a single wheel tick,
 * swipe, PageDown, ArrowDown or Space raises a sheet of water over the whole
 * window, the page jumps to `targetId` underneath it, and the water clears.
 * Going back up from the top of that section reverses it once. Everywhere
 * else scrolling is untouched; reduced-motion visitors get an instant jump.
 */
export function RiverTransition({ targetId }: { targetId: string }) {
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = document.getElementById(targetId);
    const water = sheet.current;
    if (!target || !water) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let busy = false;
    let quietUntil = 0;
    let touchStart: number | null = null;

    const targetTop = () =>
      Math.round(target.getBoundingClientRect().top + window.scrollY);

    function jump(top: number) {
      window.scrollTo({ top, behavior: "instant" as ScrollBehavior });
    }

    async function travel(top: number, direction: 1 | -1) {
      if (!water) return;
      if (motion.matches) {
        jump(top);
        quietUntil = performance.now() + 400;
        return;
      }
      busy = true;
      water.dataset.active = "true";
      const from = direction > 0 ? BELOW : ABOVE;
      const to = direction > 0 ? ABOVE : BELOW;
      try {
        await water.animate([{ transform: from }, { transform: COVER }], {
          duration: RISE_MS,
          easing: EASE_IN,
          fill: "forwards",
        }).finished;
        jump(top);
        await water.animate([{ transform: COVER }, { transform: to }], {
          duration: CLEAR_MS,
          easing: EASE_OUT,
          fill: "forwards",
        }).finished;
      } catch {
        jump(top);
      } finally {
        water.getAnimations().forEach((animation) => animation.cancel());
        delete water.dataset.active;
        busy = false;
        quietUntil = performance.now() + 450;
      }
    }

    /** Returns true when the gesture belongs to the transition. */
    function intent(direction: 1 | -1) {
      if (busy) return true;
      const top = targetTop();
      const y = window.scrollY;
      if (direction > 0 && y < top - 2) {
        void travel(top, 1);
        return true;
      }
      if (direction < 0 && y > 0 && y <= top + 2) {
        void travel(0, -1);
        return true;
      }
      return false;
    }

    function onWheel(event: WheelEvent) {
      if (event.ctrlKey || Math.abs(event.deltaY) < Math.abs(event.deltaX))
        return;
      const now = performance.now();
      // Swallow trackpad momentum that follows a transition.
      if (busy || now < quietUntil) {
        if (!busy) quietUntil = Math.min(now + 220, quietUntil + 220);
        event.preventDefault();
        return;
      }
      if (event.deltaY === 0) return;
      if (intent(event.deltaY > 0 ? 1 : -1)) event.preventDefault();
    }

    function onTouchStart(event: TouchEvent) {
      touchStart = event.touches.length === 1 ? event.touches[0].clientY : null;
    }

    function onTouchMove(event: TouchEvent) {
      if (busy) {
        event.preventDefault();
        return;
      }
      if (touchStart === null) return;
      const distance = touchStart - event.touches[0].clientY;
      if (Math.abs(distance) < 18) return;
      touchStart = null;
      if (intent(distance > 0 ? 1 : -1)) event.preventDefault();
    }

    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey) return;
      if (event.metaKey) return;
      const element = event.target as HTMLElement | null;
      if (
        element?.closest(
          "input, textarea, select, [contenteditable='true'], [role='dialog']",
        )
      )
        return;
      let direction: 1 | -1 | 0 = 0;
      if (event.key === "PageDown" || event.key === "ArrowDown") direction = 1;
      if (event.key === "PageUp" || event.key === "ArrowUp") direction = -1;
      if (event.key === " ") {
        // Space on a control activates it; leave that alone.
        if (element?.closest("button, a, summary, [role='button']")) return;
        direction = event.shiftKey ? -1 : 1;
      }
      if (direction && intent(direction)) event.preventDefault();
    }

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [targetId]);

  return <div ref={sheet} className="river-wipe" aria-hidden="true" />;
}
