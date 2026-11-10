import { MapPin, Radio, Sprout } from "lucide-react";
import { cn } from "@/lib/utils";

export function RiverWorld({ className }: { className?: string }) {
  return (
    <div className={cn("river-world", className)} aria-hidden="true">
      <div className="world-orbit world-orbit-one" />
      <div className="world-orbit world-orbit-two" />
      <div className="world-ground-shadow" />
      <div className="world-platform">
        <div className="world-platform-depth" />
        <svg className="world-map" viewBox="0 0 360 360">
          <rect width="360" height="360" rx="36" fill="#e3efdc" />
          <path d="M0 32C71 2 111 42 93 101S12 177 0 206Z" fill="#d6ef9c" />
          <path d="M360 138c-73-41-122-3-123 44s73 54 123 83" fill="#d6ef9c" />
          <path d="M7 253c60-36 113-26 135 20s-2 76-29 87H0Z" fill="#f3d591" />
          <path
            d="M147-40c103 72-50 137 41 197s166 30 119 116S207 341 230 400"
            fill="none"
            stroke="#badbc1"
            strokeWidth="105"
          />
          <path
            d="M147-40c103 72-50 137 41 197s166 30 119 116S207 341 230 400"
            fill="none"
            stroke="#53bdb7"
            strokeWidth="69"
          />
          <path
            d="M147-40c103 72-50 137 41 197s166 30 119 116S207 341 230 400"
            fill="none"
            stroke="#a0e8de"
            strokeWidth="39"
          />
          <path
            d="M147-40c103 72-50 137 41 197s166 30 119 116S207 341 230 400"
            fill="none"
            stroke="#d4fff0"
            strokeWidth="5"
            strokeDasharray="8 16"
          />
          <path
            d="m36 174 29-14 21 12-30 15Zm239-99 27-15 24 13-29 16Z"
            fill="#fff9ed"
          />
          <g>
            <rect
              x="159"
              y="116"
              width="13"
              height="6"
              rx="2"
              transform="rotate(24 159 116)"
              fill="#ff826a"
            />
            <rect
              x="220"
              y="189"
              width="9"
              height="14"
              rx="3"
              transform="rotate(-21 220 189)"
              fill="#ffad75"
            />
            <rect
              x="279"
              y="237"
              width="14"
              height="8"
              rx="2"
              transform="rotate(14 279 237)"
              fill="#ff826a"
            />
            <rect x="240" y="302" width="10" height="6" rx="2" fill="#669da8" />
          </g>
        </svg>
        <div className="world-cube world-cube-one">
          <span />
        </div>
        <div className="world-cube world-cube-two">
          <span />
        </div>
        <div className="world-tree world-tree-one" />
        <div className="world-tree world-tree-two" />
        <div className="world-tree world-tree-three" />
        <div className="world-marker world-marker-signal">
          <Radio size={18} />
        </div>
        <div className="world-marker world-marker-quest">
          <MapPin size={18} />
        </div>
        <div className="world-marker world-marker-care">
          <Sprout size={18} />
        </div>
      </div>
      <div className="world-coordinate world-coordinate-north">
        THE YAMUNA
        <br />
        <span>DELHI REACH</span>
      </div>
      <div className="world-coordinate world-coordinate-south">
        <span>ONE RIVER.</span>
        <br />
        MANY POSSIBILITIES.
      </div>
    </div>
  );
}
