"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Compass,
  Heart,
  Leaf,
  MapPin,
  ShieldCheck,
  Waves,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useBounties, useRiver } from "@/lib/queries";
import { dateTime, money } from "@/lib/format";
import {
  AsyncView,
  Badge,
  EmptyState,
  Eyebrow,
  Skeleton,
  StatusBadge,
} from "./ui/shared";
import { Button } from "./ui/button";
const Chart = dynamic(() => import("./readings-chart"), {
  loading: () => <Skeleton />,
  ssr: false,
});
export function HeroRiverNote() {
  const river = useRiver();
  return (
    <div className="hero-river-note">
      <div className="hero-note-heading">
        <span className="location-dot" />
        THE YAMUNA · DELHI<span className="hero-note-plus">+</span>
      </div>
      <p>
        Every river deserves
        <br />a better tomorrow.
      </p>
      <div className="hero-note-bottom">
        <Waves size={19} strokeWidth={1} />
        <span>
          {river.data
            ? `${river.data.open_bounties} cleanup ${river.data.open_bounties === 1 ? "quest" : "quests"} to discover`
            : "Your expedition starts here"}
        </span>
        <ArrowUpRight size={15} />
      </div>
    </div>
  );
}
export function LandingStats() {
  const river = useRiver();
  return (
    <div className="landing-stats">
      <div className="stats-intro">
        <span className="tiny-label">A WINDOW INTO THE RIVER</span>
        <span className="stats-source">
          {api.mode === "fixture"
            ? "Simulated demo snapshot"
            : "Latest API snapshot"}
        </span>
      </div>
      <AsyncView query={river}>
        {(r) => (
          <>
            {[
              ["River indicator", `${r.health_score}`, "/100"],
              ["Open cleanup quests", String(r.open_bounties), "quests"],
              ["Cleanup payouts", money(r.treasury.paid_cents), "USD"],
              [
                "Available to restore",
                money(r.treasury.available_cents),
                "USD",
              ],
            ].map(([label, value, unit]) => (
              <div className="landing-stat" key={label}>
                <span className="numeric">
                  {value}
                  <small>{unit}</small>
                </span>
                <span>{label}</span>
              </div>
            ))}
          </>
        )}
      </AsyncView>
    </div>
  );
}
export function AtlasPreview() {
  return (
    <div className="atlas-preview">
      <div className="atlas-preview-top">
        <Badge tone="aqua">
          <span className="location-dot" />
          Yamuna · Delhi reach
        </Badge>
        <span className="tiny-label">ILLUSTRATED ATLAS PREVIEW</span>
      </div>
      <svg
        className="preview-river-map"
        viewBox="0 0 660 420"
        aria-hidden="true"
      >
        <defs>
          <pattern
            id="map-grid"
            width="36"
            height="36"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M36 0H0V36"
              fill="none"
              stroke="#7ba79f"
              strokeOpacity=".1"
            />
          </pattern>
        </defs>
        <rect width="660" height="420" fill="url(#map-grid)" />
        <g fill="none" stroke="#698e7b" opacity=".2">
          <path d="M0 90Q140 10 240 110T660 40M0 110Q140 30 240 130T660 60M0 130Q140 50 240 150T660 80M0 340Q100 280 200 350T660 300M0 360Q100 300 200 370T660 320M0 380Q100 320 200 390T660 340" />
          <path d="M70 0Q180 100 100 220T190 420M90 0Q200 100 120 220T210 420M530 0Q450 130 580 230T540 420M550 0Q470 130 600 230T560 420" />
        </g>
        <path
          d="M330 -40C390 40 190 85 302 172S490 255 390 320 340 390 400 460"
          fill="none"
          stroke="#31574e"
          strokeWidth="81"
        />
        <path
          d="M330 -40C390 40 190 85 302 172S490 255 390 320 340 390 400 460"
          fill="none"
          stroke="#6aa69c"
          strokeWidth="38"
        />
        <path
          d="M330 -40C390 40 190 85 302 172S490 255 390 320 340 390 400 460"
          fill="none"
          stroke="#b3dfce"
          strokeOpacity=".4"
          strokeWidth="1"
          strokeDasharray="6 10"
        />
        <g fill="#d7c18f" stroke="#122d32" strokeWidth="6">
          <circle cx="292" cy="160" r="10" />
          <circle cx="414" cy="270" r="10" />
        </g>
        <g
          fill="#b9cdc5"
          fontSize="10"
          fontFamily="sans-serif"
          letterSpacing="3"
        >
          <text x="60" y="196">
            DELHI REACH
          </text>
          <text x="443" y="134">
            Y A M U N A
          </text>
        </g>
        <path
          d="M600 40V80M590 55L600 40L610 55"
          fill="none"
          stroke="#d2c195"
        />
        <text x="596" y="29" fill="#d2c195" fontSize="10">
          N
        </text>
      </svg>
      <div className="atlas-preview-caption">
        <MapPin size={16} />
        <div>
          <strong>Follow the need. Find your place.</strong>
          <span>Open the real map to explore event and quest locations.</span>
        </div>
        <Button asChild variant="secondary" size="icon">
          <Link href="/atlas" aria-label="Open the river atlas">
            <ArrowUpRight size={18} />
          </Link>
        </Button>
      </div>
    </div>
  );
}
export function ObservatoryPreview() {
  const readings = useQuery({
    queryKey: ["readings"],
    queryFn: ({ signal }) => api.getReadings({}, { signal }),
    refetchInterval: 5_000,
  });
  return (
    <div className="observatory-preview">
      <div className="panel-title">
        <div>
          <span className="tiny-label">RIVER OBSERVATORY</span>
          <h3>Listen to the current.</h3>
        </div>
        <Badge>
          {api.mode === "fixture" ? "Demo readings" : "Available readings"}
        </Badge>
      </div>
      <AsyncView query={readings}>
        {({ items }) => (
          <>
            <div className="preview-metrics">
              {[
                ["Turbidity", items[0]?.turbidity_ntu, "NTU"],
                ["Water pH", items[0]?.ph, "pH"],
                ["Temperature", items[0]?.temp_c, "°C"],
              ].map(([label, value, unit]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong className="numeric">
                    {value ?? "—"}
                    <small>{unit}</small>
                  </strong>
                </div>
              ))}
            </div>
            <Chart readings={items} />
            <p className="chart-source">
              {items.some((r) => r.simulated)
                ? "Simulated measurements"
                : "Device measurements"}{" "}
              · Turbidity over the available readings window · IST
            </p>
          </>
        )}
      </AsyncView>
    </div>
  );
}
export function FeaturedQuest() {
  const quests = useBounties();
  return (
    <AsyncView query={quests}>
      {({ items }) => {
        const bounty = items.find((b) => b.status === "OPEN");
        return bounty ? (
          <article className="featured-quest">
            <div className="quest-art" aria-hidden="true">
              <div className="quest-art-ring">
                <Leaf size={46} strokeWidth={1} />
              </div>
              <span className="quest-art-coordinate">YAMUNA · DELHI</span>
            </div>
            <div className="featured-quest-body">
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={bounty.status} />
                <span className="tiny-label">A REAL-WORLD CLEANUP QUEST</span>
              </div>
              <h3>{bounty.title}</h3>
              <p>{bounty.description}</p>
              <div className="quest-meta">
                <span>
                  <MapPin size={14} />
                  {bounty.radius_m} m cleanup area
                </span>
                <span>
                  <ShieldCheck size={14} />
                  Evidence required
                </span>
              </div>
              <div className="quest-reward">
                <div>
                  <span className="tiny-label">CLEANUP REWARD · USD</span>
                  <strong className="numeric">
                    {money(bounty.amount_cents)}
                    <small>
                      {api.mode === "fixture"
                        ? "simulated payout"
                        : "sandbox payout"}
                    </small>
                  </strong>
                </div>
                <Button asChild>
                  <Link href={`/bounties/${bounty.id}`}>
                    View this quest
                    <ArrowUpRight size={16} />
                  </Link>
                </Button>
              </div>
            </div>
          </article>
        ) : (
          <EmptyState
            title="Every open quest has found a guardian."
            href="/bounties"
            action="View the quest journal"
          >
            Explore completed cleanups and watch for new opportunities.
          </EmptyState>
        );
      }}
    </AsyncView>
  );
}
export function TreasuryPreview() {
  const river = useRiver();
  return (
    <div className="treasury-receipt">
      <div className="receipt-head">
        <Waves size={24} strokeWidth={1} />
        <span>THE RIVER’S TREASURY</span>
        <Badge>USD</Badge>
      </div>
      <AsyncView query={river}>
        {(r) => (
          <>
            <div className="receipt-total">
              <span>AVAILABLE FOR THE NEXT CHAPTER</span>
              <strong className="numeric">
                {money(r.treasury.available_cents)}
              </strong>
              <p>
                {api.mode === "fixture"
                  ? "Simulated shared treasury"
                  : "Shared river treasury · sandbox"}
              </p>
            </div>
            <div className="receipt-lines">
              {[
                ["Donated to the river", r.treasury.donated_cents],
                ["Reserved for cleanup", r.treasury.reserved_cents],
                ["Paid for verified work", r.treasury.paid_cents],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong className="numeric">{money(Number(value))}</strong>
                </div>
              ))}
            </div>
            <div className="receipt-note">
              <ShieldCheck size={16} />
              <span>Budget rules. Evidence checks. A public trail.</span>
            </div>
          </>
        )}
      </AsyncView>
      <Link href="/donate" className="receipt-link">
        Explore the public ledger
        <ArrowUpRight size={16} />
      </Link>
    </div>
  );
}
export function RiverDiary() {
  const diary = useQuery({
    queryKey: ["diary"],
    queryFn: ({ signal }) => api.getDiary({ signal }),
    retry: false,
  });
  return (
    <div className="river-diary">
      <div className="diary-symbol">
        <Waves size={32} strokeWidth={1} />
      </div>
      <Eyebrow>A NOTE FROM THE YAMUNA</Eyebrow>
      {diary.error &&
      "code" in diary.error &&
      diary.error.code === "NOT_FOUND" ? (
        <p>
          The river is still finding its words. Its first diary entry will
          appear here.
        </p>
      ) : (
        <AsyncView query={diary}>
          {(entry) => (
            <>
              <blockquote>{entry.text}</blockquote>
              <div className="diary-meta">
                <span>AI-written river diary · {entry.model_version}</span>
                <span>{dateTime(entry.created_at)}</span>
              </div>
            </>
          )}
        </AsyncView>
      )}
    </div>
  );
}
export function LandingWayfinder() {
  return (
    <div className="wayfinder">
      <span className="wayfinder-diamond" aria-hidden="true" />
      <span>EXPLORE WITH PURPOSE</span>
      <ArrowRight size={16} />
      <Link href="/atlas">
        <Compass size={15} />
        Find a stretch
      </Link>
      <Link href="/bounties">
        <Leaf size={15} />
        Take a quest
      </Link>
      <Link href="/donate">
        <Heart size={15} />
        Fund the change
      </Link>
    </div>
  );
}
