"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const POSTER = "/hero/poster.webp";

/**
 * Real river footage behind the landing hero. The poster still is always
 * rendered (and is the LCP element); the muted loop is added only once the
 * page is idle, and never for reduced-motion or data-saver visitors.
 */
export function RiverHeroMedia({
  className = "river-hero-media",
  priority = true,
  sizes = "100vw",
  pinned = false,
}: {
  className?: string;
  priority?: boolean;
  sizes?: string;
  /** The media stays in view while covered (sticky hero); pause it once
   *  the page has scrolled a full window past. */
  pinned?: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [source, setSource] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

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
      setSource(
        window.innerWidth < 768 ? "/hero/hero-960.mp4" : "/hero/hero-1600.mp4",
      );
    }

    const timer = window.setTimeout(decide, 600);
    motion.addEventListener("change", decide);
    return () => {
      window.clearTimeout(timer);
      motion.removeEventListener("change", decide);
    };
  }, []);

  useEffect(() => {
    const element = video.current;
    const container = frame.current;
    if (!source || !element || !container) return;
    let visible = true;

    function sync() {
      if (!element) return;
      const covered = pinned && window.scrollY > window.innerHeight;
      if (visible && !covered && !document.hidden) {
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
    if (pinned) window.addEventListener("scroll", sync, { passive: true });
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("scroll", sync);
    };
  }, [source, pinned]);

  return (
    <div ref={frame} className={className} aria-hidden="true">
      <Image src={POSTER} alt="" fill priority={priority} sizes={sizes} />
      {source && (
        <video
          ref={video}
          key={source}
          src={source}
          poster={POSTER}
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
