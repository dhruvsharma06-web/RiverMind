"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import { ArrowUpRight, Check, Heart, Layers3, Wallet } from "lucide-react";
import {
  useBounties,
  useEvents,
  usePayouts,
  useReadings,
  useRiver,
} from "@/lib/queries";
import { dateTime, elapsed, money } from "@/lib/format";
import { INR_RATE_NOTE } from "@/lib/currency";
import { parameters, type ReadingParameter } from "@/lib/reading-parameters";
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
import { SelectField } from "@/components/ui/select-field";
import {
  OverviewMetricPlaceholder,
  PlaceholderCard,
} from "@/components/workspace-placeholder";
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
  const payouts = usePayouts();
  const readings = useReadings();
  const events = useEvents();
  const [parameter, setParameter] = useState<ReadingParameter>("turbidity_ntu");
  const latest = readings.data?.items[0];
  const info = parameters[parameter];

  return (
    <div className="overview-summary">
      <PageHeading
        chapter="Workspace"
        title="Overview"
        description="Yamuna, Delhi · Water readings, cleanup activity and treasury."
        action={
          <Button asChild variant="secondary">
            <Link href="/reports">
              Monthly reports
              <ArrowUpRight size={15} />
            </Link>
          </Button>
        }
      />
      <AsyncView query={river} loading={<OverviewMetricPlaceholder />}>
        {(r) => (
          <div className="overview-stats">
            <div className="metric-card overview-indicator">
              <span className="overview-stat-label">
                River indicator <Badge tone="aqua">{r.trend}</Badge>
              </span>
              <strong className="numeric">
                {r.health_score}
                <small>/ 100</small>
              </strong>
              <span className="overview-stat-note">Prototype indicator</span>
            </div>
            {[
              {
                label: "Available treasury",
                value: r.treasury.available_cents,
                icon: Wallet,
              },
              {
                label: "Reserved",
                value: r.treasury.reserved_cents,
                icon: Layers3,
              },
              { label: "Paid out", value: r.treasury.paid_cents, icon: Check },
              {
                label: "Donations",
                value: r.treasury.donated_cents,
                icon: Heart,
              },
            ].map(({ label, value, icon: Icon }) => (
              <div className="metric-card" key={label}>
                <span className="overview-stat-label">
                  {label}
                  <Icon size={15} aria-hidden="true" />
                </span>
                <strong className="numeric" title={INR_RATE_NOTE}>
                  {money(value)}
                </strong>
                <span className="overview-stat-note">INR estimate</span>
              </div>
            ))}
            <div className="metric-card">
              <span className="overview-stat-label">Open quests</span>
              <strong className="numeric">{r.open_bounties}</strong>
              <span className="overview-stat-note">
                {r.events_24h} signals in the last 24 hours
              </span>
            </div>
          </div>
        )}
      </AsyncView>

      <div className="overview-charts">
        <Panel className="overview-water">
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
          <div className="overview-water-body">
            <div className="chart-summary-row">
              <div className="chart-current-value">
                <strong>{latest?.[parameter] ?? "—"}</strong>
                <span>
                  {info.unit} · {info.label}
                </span>
              </div>
              <label className="chart-select-label">
                <span className="sr-only">Reading parameter</span>
                <SelectField
                  value={parameter}
                  onChange={(event) =>
                    setParameter(event.target.value as ReadingParameter)
                  }
                >
                  {Object.entries(parameters).map(([key, value]) => (
                    <option key={key} value={key}>
                      {key === "tds_ppm" ? "Dissolved solids" : value.label}
                    </option>
                  ))}
                </SelectField>
              </label>
            </div>
            <AsyncView
              query={readings}
              loading={<PlaceholderCard className="placeholder-readings" />}
            >
              {({ items }) => (
                <>
                  <Chart readings={items} parameter={parameter} />
                  <div className="chart-footer">
                    <span>{items.length} readings · IST</span>
                    <span>
                      {latest ? dateTime(latest.ts) : "Waiting for data"}
                    </span>
                  </div>
                  {latest &&
                    readings.dataUpdatedAt - Date.parse(latest.ts) > 30000 && (
                      <p className="overview-stale">
                        No new reading for 30+ seconds. Showing latest available
                        data.
                      </p>
                    )}
                  <details className="reading-data-table">
                    <summary>View readings table</summary>
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th scope="col">Time · IST</th>
                            <th scope="col">NTU</th>
                            <th scope="col">pH</th>
                            <th scope="col">TDS · ppm</th>
                            <th scope="col">°C</th>
                            <th scope="col">Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((reading, index) => (
                            <tr key={`${reading.seq}-${index}`}>
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
          </div>
        </Panel>
        <AsyncView
          query={events}
          loading={<PlaceholderCard className="panel placeholder-chart" />}
        >
          {({ items }) => <SignalActivity events={items} />}
        </AsyncView>
        <AsyncView
          query={river}
          loading={<PlaceholderCard className="panel placeholder-chart" />}
        >
          {(r) => <TreasuryAllocation treasury={r.treasury} />}
        </AsyncView>
      </div>

      <div className="overview-lists">
        <Panel className="overview-list-panel">
          <PanelTitle
            aside={
              <Link href="/atlas">
                View atlas
                <ArrowUpRight size={13} />
              </Link>
            }
          >
            Latest signals
          </PanelTitle>
          <div className="overview-panel-body">
            <AsyncView query={events}>
              {({ items }) =>
                items.length ? (
                  items.slice(0, 3).map((event) => (
                    <article className="overview-list-row" key={event.id}>
                      <div>
                        <h3>{event.summary}</h3>
                        <p>
                          {event.type === "WASTE" ? "Waste" : "Sensor anomaly"}{" "}
                          · Severity {event.severity}/5 ·{" "}
                          {elapsed(event.created_at)}
                        </p>
                      </div>
                      {event.bounty_id && (
                        <Link
                          className="overview-row-link"
                          href={`/bounties/${event.bounty_id}`}
                          aria-label={`View quest for ${event.summary}`}
                        >
                          <ArrowUpRight size={17} />
                        </Link>
                      )}
                    </article>
                  ))
                ) : (
                  <EmptyState title="No signals yet.">
                    New detections will appear here.
                  </EmptyState>
                )
              }
            </AsyncView>
          </div>
        </Panel>
        <Panel className="overview-list-panel">
          <PanelTitle
            aside={
              <Link href="/bounties">
                All quests
                <ArrowUpRight size={13} />
              </Link>
            }
          >
            Cleanup quests
          </PanelTitle>
          <div className="overview-panel-body">
            <AsyncView query={bounties}>
              {({ items }) =>
                items.length ? (
                  [...items]
                    .sort(
                      (a, b) =>
                        Number(b.status === "OPEN") -
                        Number(a.status === "OPEN"),
                    )
                    .slice(0, 3)
                    .map((bounty) => (
                      <article className="overview-list-row" key={bounty.id}>
                        <div>
                          <h3>
                            <Link href={`/bounties/${bounty.id}`}>
                              {bounty.title}
                            </Link>
                          </h3>
                          <p>
                            {money(bounty.amount_cents)} INR estimate ·{" "}
                            {bounty.radius_m} m area
                          </p>
                        </div>
                        <StatusBadge status={bounty.status} />
                      </article>
                    ))
                ) : (
                  <EmptyState
                    title="No quests available."
                    href="/atlas"
                    action="Explore atlas"
                  />
                )
              }
            </AsyncView>
          </div>
        </Panel>
        <Panel className="overview-list-panel">
          <PanelTitle
            aside={
              <Link href="/donate#ledger">
                Full ledger
                <ArrowUpRight size={13} />
              </Link>
            }
          >
            Recent payouts
          </PanelTitle>
          <div className="overview-panel-body">
            <AsyncView query={payouts}>
              {({ items }) =>
                items.length ? (
                  [...items]
                    .sort(
                      (a, b) =>
                        Date.parse(b.updated_at) - Date.parse(a.updated_at),
                    )
                    .slice(0, 3)
                    .map((payout) => (
                      <article className="overview-list-row" key={payout.id}>
                        <div>
                          <h3>
                            <Link href={`/bounties/${payout.bounty_id}`}>
                              {money(payout.amount_cents)} INR estimate
                            </Link>
                          </h3>
                          <p>{payout.receiver_masked}</p>
                        </div>
                        <StatusBadge status={payout.status} />
                      </article>
                    ))
                ) : (
                  <EmptyState title="No payouts yet.">
                    Verified cleanups will leave a payment record here.
                  </EmptyState>
                )
              }
            </AsyncView>
          </div>
        </Panel>
      </div>
    </div>
  );
}
