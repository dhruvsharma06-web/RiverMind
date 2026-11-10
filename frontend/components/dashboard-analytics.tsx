"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { RiverEvent, Treasury } from "@/lib/contracts";
import { recentSignalDays } from "@/lib/reports";
import { money } from "@/lib/format";
import { EmptyState, Panel, PanelTitle, Skeleton } from "./ui/shared";

const ActivityChart = dynamic(() => import("./activity-chart"), {
  ssr: false,
  loading: () => <Skeleton />,
});

export function SignalActivity({ events }: { events: RiverEvent[] }) {
  const [now] = useState(() => new Date());
  const days = recentSignalDays(events, now);
  return (
    <Panel className="signal-analytics">
      <PanelTitle
        aside={<span className="analytics-period">Last 7 days · IST</span>}
      >
        Signals over time
      </PanelTitle>
      <div className="chart-key">
        <span>
          <i className="viz-water" />
          Waste
        </span>
        <span>
          <i className="viz-sand" />
          Sensor anomalies
        </span>
      </div>
      {days.some((day) => day.waste + day.sensor) ? (
        <ActivityChart days={days} />
      ) : (
        <EmptyState title="No recent signals returned.">
          No records in the available snapshot fall within these seven days.
        </EmptyState>
      )}
      <p className="analytics-footnote">
        Based on the latest returned events; this is not a complete history.
      </p>
      <details className="analytics-data">
        <summary>View daily counts</summary>
        <table className="data-table" aria-label="Daily counts">
          <thead>
            <tr>
              <th scope="col">Date · IST</th>
              <th scope="col">Waste</th>
              <th scope="col">Sensor</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.date}>
                <td>{day.label}</td>
                <td>{day.waste}</td>
                <td>{day.sensor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </Panel>
  );
}

export function TreasuryAllocation({ treasury }: { treasury: Treasury }) {
  const values = [
    {
      label: "Available",
      value: treasury.available_cents,
      color: "var(--viz-water)",
    },
    {
      label: "Reserved",
      value: treasury.reserved_cents,
      color: "var(--viz-sand)",
    },
    { label: "Paid", value: treasury.paid_cents, color: "var(--viz-leaf)" },
  ];
  const total = values.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;
  return (
    <Panel className="treasury-analytics">
      <PanelTitle
        aside={<span className="analytics-period">Current allocation</span>}
      >
        Every dollar, accounted for
      </PanelTitle>
      {total ? (
        <div className="allocation-layout">
          <div className="allocation-ring">
            <svg
              viewBox="0 0 160 160"
              role="img"
              aria-label={values
                .map((item) => `${item.label}: ${money(item.value)}`)
                .join(", ")}
            >
              <circle
                cx="80"
                cy="80"
                r="65"
                fill="none"
                stroke="var(--dash-soft)"
                strokeWidth="15"
              />
              {values
                .filter((item) => item.value > 0)
                .map((item) => {
                  const percentage = (item.value / total) * 100;
                  const start = offset;
                  offset += percentage;
                  return (
                    <circle
                      key={item.label}
                      cx="80"
                      cy="80"
                      r="65"
                      fill="none"
                      stroke={item.color}
                      strokeWidth="15"
                      pathLength="100"
                      strokeDasharray={`${percentage} ${100 - percentage}`}
                      strokeDashoffset={-start}
                      transform="rotate(-90 80 80)"
                    />
                  );
                })}
            </svg>
            <div>
              <strong>
                {Math.round((treasury.available_cents / total) * 100)}%
              </strong>
              <span>available</span>
            </div>
          </div>
          <dl className="allocation-legend">
            {values.map((item) => (
              <div key={item.label}>
                <dt>
                  <i style={{ background: item.color }} />
                  {item.label}
                </dt>
                <dd>{money(item.value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <EmptyState
          title="No treasury funds yet."
          href="/donate"
          action="Visit the treasury"
        />
      )}
      <p className="analytics-footnote">
        Current treasury: available + reserved + paid. Includes seed funding and
        captured donations.
      </p>
    </Panel>
  );
}
