"use client";
import Link from "next/link";
import { ArrowUpRight, Waves } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useRiver } from "@/lib/queries";
import { dateTime, money } from "@/lib/format";
import { AsyncView, Badge } from "./ui/shared";
export function LandingStats() {
  const river = useRiver();
  return (
    <div className="landing-stats">
      <div className="stats-intro">
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
              ["Open quests", String(r.open_bounties), ""],
              ["Paid out", money(r.treasury.paid_cents), "USD"],
              ["Available", money(r.treasury.available_cents), "USD"],
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
        <span className="tiny-label">Illustration</span>
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
    </div>
  );
}
export function TreasuryPreview() {
  const river = useRiver();
  return (
    <div className="treasury-receipt">
      <div className="receipt-head">
        <Waves size={24} strokeWidth={1} />
        <span>River treasury</span>
        <Badge>USD</Badge>
      </div>
      <AsyncView query={river}>
        {(r) => (
          <>
            <div className="receipt-total">
              <span>Available</span>
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
                ["Donations", r.treasury.donated_cents],
                ["Reserved for quests", r.treasury.reserved_cents],
                ["Paid out", r.treasury.paid_cents],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong className="numeric">{money(Number(value))}</strong>
                </div>
              ))}
            </div>
          </>
        )}
      </AsyncView>
      <Link href="/donate" className="receipt-link">
        See the public ledger
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
      {diary.error &&
      "code" in diary.error &&
      diary.error.code === "NOT_FOUND" ? (
        <p>No diary entry yet.</p>
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
