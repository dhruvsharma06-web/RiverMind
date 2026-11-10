"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import {
  ArrowUpRight,
  Check,
  Droplets,
  Heart,
  Layers3,
  MapPin,
  ScanEye,
  Wallet,
} from "lucide-react";
import { useBounties, useEvents, useReadings, useRiver } from "@/lib/queries";
import { dateTime, elapsed, money } from "@/lib/format";
import type { ReadingParameter } from "@/components/readings-chart";
import { RiverReach } from "@/components/river-reach";
import { RiverHeroMedia } from "@/components/river-hero-media";
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

export default function OverviewPage() {
  const river = useRiver();
  const bounties = useBounties();
  const [parameter, setParameter] = useState<ReadingParameter>("turbidity_ntu");
  const readings = useReadings();
  const events = useEvents();
  const latest = readings.data?.items[0];

  return (
    <>
      <PageHeading
        chapter="Overview"
        title="Overview"
        description="Live readings, signals, quests and treasury for the Yamuna, Delhi."
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
          <section className="river-now" aria-labelledby="river-now-title">
            <RiverHeroMedia
              className="river-now-media"
              sizes="(max-width: 1100px) 100vw, 900px"
            />
            <div className="river-now-body">
              <h2 id="river-now-title">Yamuna · Delhi reach</h2>
              <AsyncView query={river}>
                {(r) => (
                  <>
                    <div className="river-now-score">
                      <strong className="numeric">{r.health_score}</strong>
                      <span>/ 100 river indicator</span>
                      <Badge tone="aqua">{r.trend}</Badge>
                    </div>
                    <dl className="river-now-stats">
                      <div>
                        <dt>Open quests</dt>
                        <dd className="numeric">{r.open_bounties}</dd>
                      </div>
                      <div>
                        <dt>Events · 24h</dt>
                        <dd className="numeric">{r.events_24h}</dd>
                      </div>
                      <div>
                        <dt>
                          Turbidity{latest?.simulated ? " · simulated" : ""}
                        </dt>
                        <dd className="numeric">
                          {latest ? `${latest.turbidity_ntu} NTU` : "—"}
                        </dd>
                      </div>
                    </dl>
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
              <Button asChild>
                <Link href="/bounties">
                  View open quests
                  <ArrowUpRight size={16} />
                </Link>
              </Button>
            </div>
            <span className="river-now-credit">
              River footage via Pexels · illustrative, not the Yamuna
            </span>
          </section>

          {events.data && bounties.data && (
            <RiverReach
              events={events.data.items}
              bounties={bounties.data.items}
            />
          )}

          <AsyncView query={river}>
            {(r) => (
              <div className="metric-grid overview-metrics">
                {[
                  {
                    label: "Available",
                    value: r.treasury.available_cents,
                    icon: Wallet,
                    tone: "teal",
                  },
                  {
                    label: "Reserved for quests",
                    value: r.treasury.reserved_cents,
                    icon: Layers3,
                    tone: "orange",
                  },
                  {
                    label: "Paid out",
                    value: r.treasury.paid_cents,
                    icon: Check,
                    tone: "green",
                  },
                  {
                    label: "Donations",
                    value: r.treasury.donated_cents,
                    icon: Heart,
                    tone: "blue",
                  },
                ].map(({ label, value, icon: Icon, tone }) => (
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
              Water readings
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
                <h2>Open quests</h2>
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
                      .map((b) => (
                        <article className="overview-quest-card" key={b.id}>
                          <div className="overview-quest-status">
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
              Payouts
            </PanelTitle>
            <PayoutLedger />
          </Panel>
        </div>

        <aside className="overview-rail" aria-label="River activity">
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
