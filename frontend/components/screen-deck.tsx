"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Must match the media query that enables snapping in dashboard.css. */
const SNAP_QUERY =
  "(min-width: 900px) and (min-height: 700px) and (prefers-reduced-motion: no-preference)";

/** Where the document stops for screen `index`: the page top for the first
 *  screen (it shares the window with the top bar), else the screen's top. */
function stopFor(screens: HTMLElement[], index: number) {
  if (index <= 0) return 0;
  return Math.round(
    screens[index].getBoundingClientRect().top + window.scrollY,
  );
}

/** True when the wheel should scroll something inside the screen instead,
 *  e.g. a long table that can still move in that direction. */
function scrollsInside(
  target: EventTarget | null,
  stop: Element,
  down: boolean,
) {
  let node = target instanceof Element ? target : null;
  while (node && node !== stop) {
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      const room = down
        ? node.scrollTop + node.clientHeight < node.scrollHeight - 1
        : node.scrollTop > 0;
      if (room) return true;
    }
    node = node.parentElement;
  }
  return false;
}

/**
 * Full-height screens with one smooth, eased step per scroll. Snapping is
 * native CSS (scroll-snap on the document, enabled by the `screen-snap`
 * class only on large, motion-tolerant viewports - see dashboard.css), which
 * covers keyboard, touch and scrollbar input. A wheel or trackpad gesture is
 * turned into exactly one step, because native snapping lets a small wheel
 * movement settle back on the same screen. The screen in view gets
 * `data-active` so its content can ease in, and a dot indicator allows
 * direct jumps. Elsewhere the page scrolls normally.
 */
export function ScreenDeck({
  labels,
  children,
}: {
  labels: string[];
  children: ReactNode;
}) {
  const deck = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const root = document.documentElement;
    const container = deck.current;
    if (!container) return;
    root.classList.add("screen-snap");
    const screens = Array.from(
      container.querySelectorAll<HTMLElement>(":scope > .deck-screen"),
    );

    // The first screen shares the window with the top bar; size it to what
    // is left so the second screen starts exactly one window down.
    const measure = () => {
      const first = screens[0];
      if (!first) return;
      const offset = first.getBoundingClientRect().top + window.scrollY;
      container.style.setProperty("--deck-offset", `${Math.round(offset)}px`);
    };
    measure();
    window.addEventListener("resize", measure);

    // A screen is "in view" when it crosses the middle of the window, which
    // works for screens of any height.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const screen = entry.target as HTMLElement;
          screen.dataset.active = String(entry.isIntersecting);
          if (entry.isIntersecting) setActive(screens.indexOf(screen));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    screens.forEach((screen) => observer.observe(screen));

    const snapping = window.matchMedia(SNAP_QUERY);
    let quietUntil = 0;
    function onWheel(event: WheelEvent) {
      if (!snapping.matches || event.ctrlKey || !screens.length) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const down = event.deltaY > 0;
      if (scrollsInside(event.target, document.body, down)) return;
      const now = performance.now();
      if (now < quietUntil) {
        // Swallow the rest of one gesture (trackpad momentum included).
        event.preventDefault();
        quietUntil = Math.max(quietUntil, now + 160);
        return;
      }
      const stops = screens.map((_, index) => stopFor(screens, index));
      const y = window.scrollY;
      const last = stops.length - 1;
      // Past the last screen (the footer) or before the first: native scroll.
      if ((down && y >= stops[last] - 2) || (!down && y <= 0)) return;
      let current = 0;
      stops.forEach((stop, index) => {
        if (Math.abs(stop - y) < Math.abs(stops[current] - y)) current = index;
      });
      let next = current + (down ? 1 : -1);
      if (!down && y > stops[last] + 2) next = last;
      next = Math.min(Math.max(next, 0), last);
      event.preventDefault();
      quietUntil = now + 700;
      window.scrollTo({ top: stops[next], behavior: "smooth" });
    }
    window.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      root.classList.remove("screen-snap");
      window.removeEventListener("resize", measure);
      window.removeEventListener("wheel", onWheel);
      observer.disconnect();
    };
  }, []);

  function go(index: number) {
    const screens = Array.from(
      deck.current?.querySelectorAll<HTMLElement>(":scope > .deck-screen") ??
        [],
    );
    if (!screens[index]) return;
    window.scrollTo({ top: stopFor(screens, index), behavior: "smooth" });
  }

  return (
    <div ref={deck} className="overview-deck">
      {children}
      <nav className="deck-dots" aria-label="Overview sections">
        {labels.map((label, index) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            title={label}
            aria-current={index === active ? "true" : undefined}
            onClick={() => go(index)}
          />
        ))}
      </nav>
    </div>
  );
}
