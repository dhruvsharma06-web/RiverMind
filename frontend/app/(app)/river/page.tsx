"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Check,
  Compass,
  Droplets,
  Heart,
  Layers3,
  MapPin,
  ScanEye,
  Wallet,
} from "lucide-react";
import { api } from "@/lib/api";
import { useBounties, useRiver } from "@/lib/queries";
import { dateTime, elapsed, money } from "@/lib/format";
import type { ReadingParameter } from "@/components/readings-chart";
import { AbstractArt } from "@/components/abstract-art";
import {
  AsyncView,
  Badge,
  EmptyState,
  PageHeading,
  Panel,
  PanelTitle,
  Skeleton,
  StatusBadge,
} from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { RiverDiary } from "@/components/landing-data";
import { PayoutLedger } from "@/components/payout-ledger";
import {
  SignalActivity,
  TreasuryAllocation,
} from "@/components/dashboard-analytics";

const Chart = dynamic(() => import("@/components/readings-chart"), {
  ssr: false,
  loading: () => <Skeleton />,
});

export default function ObservatoryPage() {
  const river = useRiver();
  const bounties = useBounties();
  const [parameter, setParameter] = useState<ReadingParameter>("turbidity_ntu");
  const readings = useQuery({
    queryKey: ["readings"],
    queryFn: ({ signal }) => api.getReadings({}, { signal }),
    refetchInterval: 5_000,
  });
  const events = useQuery({
    queryKey: ["events"],
    queryFn: ({ signal }) => api.getEvents({}, { signal }),
    refetchInterval: 5_000,
  });
  const latest = readings.data?.items[0];

  return (
    <>
      <PageHeading
        chapter="Your river workspace"
        title="Overview"
        description="A little care. A real difference. Here’s what’s happening along the Yamuna."
        action={
          <Button asChild variant="secondary">
            <Link href="/reports">
              Monthly reports
              <ArrowUpRight size={15} />
            </Link>
          </Button>
        }
      />
      <div className="overview-layout">
        <div className="overview-main">
          <div className="overview-feature-row">
            <section className="expedition-banner">
              <AbstractArt variant="river" />
              <div className="expedition-banner-copy">
                <span className="banner-label">
                  <Compass size={13} />
                  THE YAMUNA EXPEDITION
                </span>
                <h2>
                  Good things start
                  <br />
                  with a small ripple.
                </h2>
                <p>
                  Find a stretch. Make a change.
                  <br />
                  Let your next cleanup tell the story.
                </p>
                <Button asChild>
                  <Link href="/bounties">
                    Explore quests
                    <ArrowUpRight size={16} />
                  </Link>
                </Button>
              </div>
            </section>
            <Panel className="overview-score-card">
              <PanelTitle>River indicator</PanelTitle>
              <AsyncView query={river}>
                {(r) => (
                  <>
                    <div
                      className="overview-score-ring"
                      style={
                        {
                          "--score-angle": `${r.health_score * 3.6}deg`,
                        } as CSSProperties
                      }
                    >
                      <div>
                        <strong>{r.health_score}</strong>
                        <span>out of 100</span>
                      </div>
                    </div>
                    <Badge tone="aqua">{r.trend}</Badge>
                    <details className="health-method">
                      <summary>About this indicator</summary>
                      <p>
                        A prototype operational indicator based on event
                        severity and open cleanup quests. It is not a water
                        safety assessment.
                      </p>
                    </details>
                  </>
                )}
              </AsyncView>
            </Panel>
          </div>

          <AsyncView query={river}>
            {(r) => (
              <div className="metric-grid overview-metrics">
                {[
                  {
                    label: "Available treasury",
                    value: r.treasury.available_cents,
                    caption: "Ready to fund a cleanup",
                    icon: Wallet,
                    tone: "teal",
                  },
                  {
                    label: "Reserved for quests",
                    value: r.treasury.reserved_cents,
                    caption: "Committed to posted work",
                    icon: Layers3,
                    tone: "orange",
                  },
                  {
                    label: "Cleanup payouts",
                    value: r.treasury.paid_cents,
                    caption: "Confirmed payment total",
                    icon: Check,
                    tone: "green",
                  },
                  {
                    label: "Donations received",
                    value: r.treasury.donated_cents,
                    caption: "Captured contributions",
                    icon: Heart,
                    tone: "blue",
                  },
                ].map(({ label, value, caption, icon: Icon, tone }) => (
                  <div className="metric-card" key={label}>
                    <div className="metric-card-heading">
                      <span className={`metric-icon metric-icon-${tone}`}>
                        <Icon size={17} />
                      </span>
                      <span>{label}</span>
                    </div>
                    <strong className="numeric">
                      {money(value)}
                      <small>USD</small>
                    </strong>
                    <p>{caption}</p>
                  </div>
                ))}
              </div>
            )}
          </AsyncView>

          <Panel className="overview-chart-panel">
            <PanelTitle
              aside={
                <Badge>
                  {latest?.simulated
                    ? "Simulated readings"
                    : latest
                      ? "Device readings"
                      : "Awaiting readings"}
                </Badge>
              }
            >
              The water, at a glance
            </PanelTitle>
            <div className="chart-summary-row">
              <div className="chart-current-value">
                <strong>{latest?.[parameter] ?? "—"}</strong>
                <span>
                  {parameter === "turbidity_ntu"
                    ? "NTU · turbidity"
                    : parameter === "ph"
                      ? "pH"
                      : parameter === "tds_ppm"
                        ? "ppm · dissolved solids"
                        : "°C · temperature"}
                </span>
              </div>
              <label className="chart-select-label">
                <span className="sr-only">Reading parameter</span>
                <select
                  className="filter-select"
                  value={parameter}
                  onChange={(e) =>
                    setParameter(e.target.value as ReadingParameter)
                  }
                >
                  <option value="turbidity_ntu">Turbidity</option>
                  <option value="ph">Water pH</option>
                  <option value="tds_ppm">Dissolved solids</option>
                  <option value="temp_c">Temperature</option>
                </select>
              </label>
            </div>
            <AsyncView query={readings}>
              {({ items }) => (
                <>
                  <Chart readings={items} parameter={parameter} />
                  <div className="chart-footer">
                    <span>{items.length} readings · Time in IST</span>
                    <span>
                      {items[0]
                        ? `Latest ${dateTime(items[0].ts)}`
                        : "Waiting for a reading"}
                    </span>
                  </div>
                  {items[0] &&
                    readings.dataUpdatedAt - Date.parse(items[0].ts) >
                      30000 && (
                      <p className="reading-stale-note">
                        No new reading for 30+ seconds. Showing the latest
                        available measurements.
                      </p>
                    )}
                  <details className="reading-data-table">
                    <summary>View readings table</summary>
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th scope="col">Time · IST</th>
                            <th scope="col">Turbidity · NTU</th>
                            <th scope="col">pH</th>
                            <th scope="col">TDS · ppm</th>
                            <th scope="col">Temp · °C</th>
                            <th scope="col">Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((reading, i) => (
                            <tr key={`${reading.seq}-${i}`}>
                              <td>{dateTime(reading.ts)}</td>
                              <td>{reading.turbidity_ntu}</td>
                              <td>{reading.ph}</td>
                              <td>{reading.tds_ppm}</td>
                              <td>{reading.temp_c}</td>
                              <td>
                                {reading.simulated ? "Simulated" : "Device"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </>
              )}
            </AsyncView>
          </Panel>

          <div className="overview-analytics-grid">
            <AsyncView query={events}>
              {({ items }) => <SignalActivity events={items} />}
            </AsyncView>
            <AsyncView query={river}>
              {(r) => <TreasuryAllocation treasury={r.treasury} />}
            </AsyncView>
          </div>

          <section className="overview-quests">
            <div className="section-title">
              <div>
                <h2>Find your next good thing</h2>
                <p>Real cleanup work. Clear rewards. A better river.</p>
              </div>
              <Link href="/bounties">
                All quests
                <ArrowUpRight size={15} />
              </Link>
            </div>
            <AsyncView query={bounties}>
              {({ items }) =>
                items.length ? (
                  <div className="overview-quest-grid">
                    {[...items]
                      .sort(
                        (a, b) =>
                          Number(b.status === "OPEN") -
                          Number(a.status === "OPEN"),
                      )
                      .slice(0, 3)
                      .map((b, i) => (
                        <article className="overview-quest-card" key={b.id}>
                          <div className="overview-quest-cover">
                            <AbstractArt
                              variant={
                                (["river", "bloom", "ripple"] as const)[i % 3]
                              }
                            />
                            <StatusBadge status={b.status} />
                          </div>
                          <div className="overview-quest-body">
                            <h3>
                              <Link href={`/bounties/${b.id}`}>{b.title}</Link>
                            </h3>
                            <p>
                              <MapPin size={12} />
                              {b.radius_m} m cleanup area
                            </p>
                            <div>
                              <span>
                                <small>Reward · USD</small>
                                <strong>{money(b.amount_cents)}</strong>
                              </span>
                              <Link
                                href={`/bounties/${b.id}`}
                                className="quest-arrow"
                                aria-label={`View ${b.title}`}
                              >
                                <ArrowUpRight size={19} />
                              </Link>
                            </div>
                          </div>
                        </article>
                      ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No quests available yet."
                    href="/atlas"
                    action="Explore the atlas"
                  />
                )
              }
            </AsyncView>
          </section>

          <Panel id="ledger">
            <PanelTitle
              aside={
                <Link href="/donate">
                  View treasury
                  <ArrowUpRight size={14} />
                </Link>
              }
            >
              The payout trail
            </PanelTitle>
            <PayoutLedger />
          </Panel>
        </div>

        <aside className="overview-rail" aria-label="River activity">
          <Panel className="river-snapshot">
            <PanelTitle>On the river</PanelTitle>
            <span className="snapshot-symbol">
              <Droplets size={25} />
            </span>
            <h3>Yamuna, Delhi</h3>
            <p>One river. A shared responsibility.</p>
            <AsyncView query={river}>
              {(r) => (
                <div className="snapshot-counts">
                  <div>
                    <strong>{r.open_bounties}</strong>
                    <span>Open quests</span>
                  </div>
                  <div>
                    <strong>{r.events_24h}</strong>
                    <span>Events · 24h</span>
                  </div>
                </div>
              )}
            </AsyncView>
            <Link className="rail-link" href="/atlas">
              Open river atlas
              <ArrowUpRight size={15} />
            </Link>
          </Panel>

          <Panel className="signal-panel">
            <PanelTitle aside={<Link href="/atlas">View all</Link>}>
              Latest signals
            </PanelTitle>
            <AsyncView query={events}>
              {({ items }) =>
                items.length ? (
                  <div className="event-list">
                    {items.slice(0, 3).map((event) => (
                      <article key={event.id} className="event-item">
                        <span
                          className={`event-symbol ${event.type === "WASTE" ? "event-waste" : "event-water"}`}
                        >
                          {event.type === "WASTE" ? (
                            <ScanEye size={17} />
                          ) : (
                            <Droplets size={17} />
                          )}
                        </span>
                        <div>
                          <h3>{event.summary}</h3>
                          <p>
                            Severity {event.severity}/5 ·{" "}
                            {elapsed(event.created_at)}
                          </p>
                          {event.bounty_id && (
                            <Link href={`/bounties/${event.bounty_id}`}>
                              View quest
                              <ArrowUpRight size={12} />
                            </Link>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No signals in this snapshot." />
                )
              }
            </AsyncView>
          </Panel>

          <Panel className="quest-activity">
            <PanelTitle>Quest activity</PanelTitle>
            <AsyncView query={bounties}>
              {({ items }) => {
                const stages = [
                  {
                    label: "Ready to claim",
                    count: items.filter((b) => b.status === "OPEN").length,
                    className: "activity-teal",
                  },
                  {
                    label: "In progress",
                    count: items.filter((b) =>
                      [
                        "CLAIMED",
                        "PROOF_SUBMITTED",
                        "VERIFIED",
                        "PAYOUT_PENDING_APPROVAL",
                        "PAYOUT_FAILED",
                      ].includes(b.status),
                    ).length,
                    className: "activity-orange",
                  },
                  {
                    label: "Paid cleanups",
                    count: items.filter((b) => b.status === "PAID").length,
                    className: "activity-green",
                  },
                  {
                    label: "Evidence rejected",
                    count: items.filter((b) => b.status === "REJECTED").length,
                    className: "activity-coral",
                  },
                ];
                return (
                  <>
                    <p className="activity-caption">
                      Across {items.length} reported quests
                    </p>
                    <div className="activity-stages">
                      {stages.map((stage) => (
                        <div key={stage.label}>
                          <span className={`activity-dot ${stage.className}`} />
                          <span>{stage.label}</span>
                          <strong>{stage.count}</strong>
                        </div>
                      ))}
                    </div>
                    <div className="activity-note">
                      <Check size={15} />
                      <span>
                        Every reward follows evidence and approval rules.
                      </span>
                    </div>
                  </>
                );
              }}
            </AsyncView>
          </Panel>

          <Panel className="dashboard-diary">
            <RiverDiary />
          </Panel>
        </aside>
      </div>
    </>
  );
}
