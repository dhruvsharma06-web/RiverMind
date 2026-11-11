"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { FOOTAGE } from "@/components/river-hero-media";

const media = FOOTAGE.flow;

/**
 * A fixed, heavily subdued layer of moving water behind the page content.
 * It follows the same loading rules as RiverHeroMedia: the loop is added only
 * once the page is idle, never for reduced-motion or data-saver visitors
 * (they keep the still poster), and it pauses whenever the tab is hidden.
 * `startAfter` (px of scroll) keeps the layer empty while a full-bleed hero
 * still covers it, so the landing does not decode two videos at once.
 */
export function WaterBackdrop({ startAfter = 0 }: { startAfter?: number }) {
  const video = useRef<HTMLVideoElement>(null);
  const [armed, setArmed] = useState(startAfter === 0);
  const [source, setSource] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (armed) return;
    const check = () => {
      if (window.scrollY > startAfter) setArmed(true);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, [armed, startAfter]);

  useEffect(() => {
    if (!armed) return;
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
  }, [armed]);

  useEffect(() => {
    const element = video.current;
    if (!source || !element) return;
    function sync() {
      if (!element) return;
      if (document.hidden) element.pause();
      else element.play().catch(() => setPlaying(false));
    }
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [source]);

  return (
    <div className="water-backdrop" aria-hidden="true">
      {armed && (
        <div className="water-backdrop-media">
          <Image src={media.poster} alt="" fill sizes="100vw" />
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
        </div>
      )}
    </div>
  );
}
