import Link from "next/link";
import { ArrowUpRight, Droplets, MapPin, ScanEye } from "lucide-react";
import type { Bounty, RiverEvent } from "@/lib/contracts";
import { Panel, PanelTitle } from "./ui/shared";

// The Delhi stretch of the Yamuna runs roughly north to south between the
// Wazirabad and Okhla barrages; latitude alone places a point along it.
const NORTH_LAT = 28.72;
const SOUTH_LAT = 28.52;
const LANDMARKS = [
  { label: "Wazirabad", lat: 28.711 },
  { label: "ITO", lat: 28.628 },
  { label: "Okhla", lat: 28.545 },
];
const WIDTH = 1000;
const HEIGHT = 120;

function along(lat: number) {
  const t = (NORTH_LAT - lat) / (NORTH_LAT - SOUTH_LAT);
  return Math.min(1, Math.max(0, t));
}
function point(t: number) {
  return {
    x: 40 + t * (WIDTH - 80),
    y: HEIGHT / 2 + 13 * Math.sin(t * Math.PI * 2.4),
  };
}
const course = Array.from({ length: 61 }, (_, i) => {
  const { x, y } = point(i / 60);
  return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
}).join(" ");

type Marker = {
  key: string;
  href: string;
  label: string;
  kind: "waste" | "water" | "quest";
  t: number;
};

// Points that share a spot fan out vertically so each stays clickable.
function place(markers: Marker[]) {
  const placed: (Marker & { left: number; top: number })[] = [];
  let stack = 0;
  markers.forEach((marker, i) => {
    stack = i && marker.t - markers[i - 1].t < 0.035 ? stack + 1 : 0;
    const { x, y } = point(marker.t);
    const lift = stack ? Math.ceil(stack / 2) * 30 * (stack % 2 ? -1 : 1) : 0;
    placed.push({ ...marker, left: (x / WIDTH) * 100, top: y + lift });
  });
  return placed;
}

/** A schematic of the Delhi reach with current signals and open quests. */
export function RiverReach({
  events,
  bounties,
}: {
  events: RiverEvent[];
  bounties: Bounty[];
}) {
  const markers: Marker[] = [
    ...events.slice(0, 8).map((event) => ({
      key: `event-${event.id}`,
      href: event.bounty_id ? `/bounties/${event.bounty_id}` : "/atlas",
      label: `${event.summary} · severity ${event.severity} of 5`,
      kind: event.type === "WASTE" ? ("waste" as const) : ("water" as const),
      t: along(event.lat),
    })),
    ...bounties
      .filter((bounty) => bounty.status === "OPEN")
      .map((bounty) => ({
        key: `quest-${bounty.id}`,
        href: `/bounties/${bounty.id}`,
        label: `Open quest: ${bounty.title}`,
        kind: "quest" as const,
        t: along(bounty.lat),
      })),
  ].sort((a, b) => a.t - b.t);

  const placed = place(markers);

  return (
    <Panel className="river-reach">
      <PanelTitle
        aside={
          <Link href="/atlas">
            Open full map
            <ArrowUpRight size={14} />
          </Link>
        }
      >
        Along the river
      </PanelTitle>
      <div className="reach-stage">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <path className="reach-bank" d={course} />
          <path className="reach-water" d={course} />
        </svg>
        {LANDMARKS.map(({ label, lat }) => (
          <span
            key={label}
            className="reach-landmark"
            style={{ left: `${(point(along(lat)).x / WIDTH) * 100}%` }}
          >
            {label}
          </span>
        ))}
        {placed.map((marker) => (
          <Link
            key={marker.key}
            href={marker.href}
            className={`reach-marker reach-${marker.kind}`}
            style={{ left: `${marker.left}%`, top: marker.top }}
            aria-label={marker.label}
            title={marker.label}
          >
            {marker.kind === "quest" ? (
              <MapPin size={14} />
            ) : marker.kind === "waste" ? (
              <ScanEye size={14} />
            ) : (
              <Droplets size={14} />
            )}
          </Link>
        ))}
      </div>
      <div className="reach-foot">
        <span className="reach-key">
          <span>
            <i className="reach-waste" />
            Waste
          </span>
          <span>
            <i className="reach-water" />
            Water anomaly
          </span>
          <span>
            <i className="reach-quest" />
            Open quest
          </span>
        </span>
        <span>North to south · Schematic, not to scale</span>
      </div>
    </Panel>
  );
}
