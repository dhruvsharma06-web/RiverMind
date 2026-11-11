"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/** Footage sets in public/: poster plus a small and a large muted loop. */
export const FOOTAGE = {
  hero: {
    poster: "/hero/poster.webp",
    small: "/hero/hero-960.mp4",
    large: "/hero/hero-1600.mp4",
  },
  flow: {
    poster: "/flow/poster.webp",
    small: "/flow/flow-960.mp4",
    large: "/flow/flow-1600.mp4",
  },
} as const;

/**
 * Real water footage (illustrative, not the Yamuna). The poster still is
 * always rendered (and is the LCP element in the hero); the muted loop is
 * added only once the page is idle, and never for reduced-motion or
 * data-saver visitors. Playback pauses whenever the frame is off-screen.
 */
export function RiverHeroMedia({
  className = "river-hero-media",
  priority = true,
  sizes = "100vw",
  footage = "hero",
}: {
  footage?: keyof typeof FOOTAGE;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [source, setSource] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const media = FOOTAGE[footage];

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;

    function decide() {
      if (motion.matches || connection?.saveData) {
        setSource(null);
        setPlaying(false);
        return;
      }
      setSource(window.innerWidth < 768 ? media.small : media.large);
    }

    const timer = window.setTimeout(decide, 600);
    motion.addEventListener("change", decide);
    return () => {
      window.clearTimeout(timer);
      motion.removeEventListener("change", decide);
    };
  }, [media]);

  useEffect(() => {
    const element = video.current;
    const container = frame.current;
    if (!source || !element || !container) return;
    let visible = true;

    function sync() {
      if (!element) return;
      if (visible && !document.hidden) {
        // Autoplay can be refused (e.g. low-power mode); the poster stays.
        element.play().catch(() => setPlaying(false));
      } else {
        element.pause();
      }
    }

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer.observe(container);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [source]);

  return (
    <div ref={frame} className={className} aria-hidden="true">
      <Image src={media.poster} alt="" fill priority={priority} sizes={sizes} />
      {source && (
        <video
          ref={video}
          key={source}
          src={source}
          poster={media.poster}
          muted
          loop
          playsInline
          autoPlay
          preload="none"
          disablePictureInPicture
          tabIndex={-1}
          data-playing={playing}
          onPlaying={() => setPlaying(true)}
        />
      )}
      <div className="river-hero-scrim" />
    </div>
  );
}
