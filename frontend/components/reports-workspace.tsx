"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileChartColumn, Printer, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { dateTime, money, statusLabels } from "@/lib/format";
import {
  buildMonthlyReport,
  istDay,
  monthLabel,
  monthlyReportCsv,
  readingMetrics,
  REPORT_BASIS,
  REPORT_COVERAGE,
  validMonth,
} from "@/lib/reports";
import {
  AsyncView,
  Badge,
  EmptyState,
  PageHeading,
  Panel,
  PanelTitle,
  Skeleton,
} from "./ui/shared";
import { Button } from "./ui/button";

const ActivityChart = dynamic(() => import("./activity-chart"), {
  ssr: false,
  loading: () => <Skeleton />,
});

function downloadCsv(text: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ReportsWorkspace() {
  const [month, setMonth] = useState(() => istDay(new Date()).slice(0, 7));
  const query = useQuery({
    queryKey: ["report-records"],
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => {
      const [readings, events, bounties, payouts, donations, health] =
        await Promise.all([
          api.getReadings({ limit: 200 }, { signal }),
          api.getEvents({ limit: 50 }, { signal }),
          api.getBounties({}, { signal }),
          api.getPayouts({}, { signal }),
          api.getDonations({ limit: 20 }, { signal }),
          api.getHealth({ signal }),
        ]);
      return {
        readings: readings.items,
        events: events.items,
        bounties: bounties.items,
        payouts: payouts.items,
        donations: donations.items,
        generatedAt: new Date().toISOString(),
        source:
          api.mode === "fixture"
            ? "Simulated demo records · no real payments"
            : `API records · ${health.mock_ai ? "Mock AI" : "AI enabled"} · PayPal ${health.paypal_mode}`,
      };
    },
  });

  return (
    <div className="report-page">
      <PageHeading
        chapter="A clearer view of your river"
        title="Monthly reports"
        description="Explore the records. Share the progress. Take a little perspective with you."
        action={
          <Badge>
            <FileChartColumn size={14} />
            Available-record summaries
          </Badge>
        }
      />
      <div className="report-controls">
        <label htmlFor="report-month">
          Report month <span>IST · Asia/Kolkata</span>
          <input
            id="report-month"
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </label>
        <Button
          variant="secondary"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw size={15} />
          {query.isFetching ? "Refreshing…" : "Refresh records"}
        </Button>
      </div>
      <AsyncView query={query}>
        {(records) => {
          if (!validMonth(month))
            return (
              <EmptyState title="Choose a report month.">
                Select a month to preview and download its available records.
              </EmptyState>
            );
          const report = buildMonthlyReport(records, month);
          const statuses = [
            ...new Set(report.bounties.map((bounty) => bounty.status)),
          ];
          const observedMonths = [
            ...new Set([
              ...records.readings.map((r) => istDay(r.ts).slice(0, 7)),
              ...records.events.map((r) => istDay(r.created_at).slice(0, 7)),
              ...records.bounties.map((r) => istDay(r.created_at).slice(0, 7)),
              ...records.payouts.map((r) => istDay(r.created_at).slice(0, 7)),
              ...records.donations.map((r) => istDay(r.created_at).slice(0, 7)),
            ]),
          ]
            .sort()
            .reverse();
          return (
            <>
              <Panel className="report-cover">
                <div className="report-cover-heading">
                  <div>
                    <span className="report-kicker">
                      RIVERMIND / YAMUNA, DELHI
                    </span>
                    <h2>{monthLabel(month)}</h2>
                    <p>Monthly river report</p>
                  </div>
                  <FileChartColumn
                    size={40}
                    strokeWidth={1}
                    aria-hidden="true"
                  />
                </div>
                <div className="report-source">
                  <Badge tone={api.mode === "fixture" ? "gold" : "aqua"}>
                    {records.source}
                  </Badge>
                  <span>Snapshot loaded {dateTime(records.generatedAt)}</span>
                </div>
                <p className="report-scope">{REPORT_COVERAGE}</p>
                <div className="report-downloads">
                  <Button
                    disabled={!report.totalRecords}
                    onClick={() =>
                      downloadCsv(
                        monthlyReportCsv(
                          report,
                          records.source,
                          records.generatedAt,
                        ),
                        `rivermind-${month}-available-records.csv`,
                      )
                    }
                  >
                    <Download size={16} />
                    Download CSV
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!report.totalRecords}
                    onClick={() => window.print()}
                  >
                    <Printer size={16} />
                    Print / Save as PDF
                  </Button>
                  <span>
                    CSV includes summary and underlying records. PDF uses your
                    browser’s print dialog.
                  </span>
                </div>
              </Panel>
              {!report.totalRecords ? (
                <Panel>
                  <EmptyState title="No returned records for this month.">
                    This does not mean there was no activity.{" "}
                    {observedMonths.length
                      ? `Available records cover: ${observedMonths.map(monthLabel).join(", ")}.`
                      : "Refresh when new records are available."}
                  </EmptyState>
                </Panel>
              ) : (
                <>
                  <div className="metric-grid report-metrics">
                    {[
                      [
                        "Readings",
                        report.readings.length,
                        `${report.simulatedReadings} simulated · ${report.readings.length - report.simulatedReadings} device`,
                      ],
                      [
                        "Signals detected",
                        report.events.length,
                        "From returned event records",
                      ],
                      [
                        "Quests created",
                        report.bounties.length,
                        "Current statuses shown below",
                      ],
                      [
                        "Captured donations",
                        money(report.donatedCents),
                        `${report.donations.length} returned contributions · USD`,
                      ],
                    ].map(([label, value, caption]) => (
                      <div className="metric-card" key={label}>
                        <span>{label}</span>
                        <strong className="numeric">{value}</strong>
                        <p>{caption}</p>
                      </div>
                    ))}
                  </div>
                  <Panel className="report-signals">
                    <PanelTitle
                      aside={
                        <span className="analytics-period">
                          {report.events.length} available events
                        </span>
                      }
                    >
                      A month of signals
                    </PanelTitle>
                    <div className="chart-key">
                      <span>
                        <i className="viz-water" />
                        Waste detections
                      </span>
                      <span>
                        <i className="viz-sand" />
                        Sensor anomalies
                      </span>
                    </div>
                    {report.events.length ? (
                      <ActivityChart days={report.daily} />
                    ) : (
                      <p className="analytics-footnote">
                        No event records returned for this month.
                      </p>
                    )}
                    <p className="analytics-footnote">
                      Zero means no events in the returned records for that day.
                      It does not establish that the river was free of
                      pollution.
                    </p>
                    <details className="analytics-data">
                      <summary>View daily signal counts</summary>
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th scope="col">Date · IST</th>
                              <th scope="col">Waste</th>
                              <th scope="col">Sensor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.daily.map((day) => (
                              <tr key={day.date}>
                                <td>{day.label}</td>
                                <td>{day.waste}</td>
                                <td>{day.sensor}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </Panel>
                  <div className="report-detail-grid">
                    <Panel>
                      <PanelTitle>Water measurements</PanelTitle>
                      <p className="analytics-footnote">
                        Statistics across {report.readings.length} returned
                        readings, including {report.simulatedReadings}{" "}
                        simulated. No safety assessment is implied.
                      </p>
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th scope="col">Parameter</th>
                              <th scope="col">Average</th>
                              <th scope="col">Range</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.sensorStats.map((metric) => (
                              <tr key={metric.key}>
                                <th scope="row">
                                  {metric.label}
                                  <small className="report-unit">
                                    {metric.unit}
                                  </small>
                                </th>
                                <td>{metric.average?.toFixed(2) ?? "—"}</td>
                                <td>
                                  {metric.min === null
                                    ? "—"
                                    : `${metric.min}–${metric.max}`}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Panel>
                    <Panel>
                      <PanelTitle>Cleanup & funding</PanelTitle>
                      <dl className="report-funding">
                        <div>
                          <dt>Successful payouts</dt>
                          <dd>
                            {money(report.succeededPayoutCents)}{" "}
                            <small>USD</small>
                          </dd>
                        </div>
                      </dl>
                      <p className="analytics-footnote">
                        Payouts created in this month and currently marked
                        successful. This is not a total of payments completed
                        during the month.
                      </p>
                      <div className="report-quest-statuses">
                        {statuses.map((status) => (
                          <div key={status}>
                            <span>{statusLabels[status] ?? status}</span>
                            <strong>
                              {
                                report.bounties.filter(
                                  (bounty) => bounty.status === status,
                                ).length
                              }
                            </strong>
                          </div>
                        ))}
                        {!statuses.length && (
                          <p>No quests returned for this month.</p>
                        )}
                      </div>
                    </Panel>
                  </div>
                  <Panel className="report-method">
                    <PanelTitle>How to read this report</PanelTitle>
                    <p>{REPORT_BASIS}</p>
                    <p>
                      All money in CSV files is recorded in integer USD cents.
                      Exports omit names, email addresses and private claim
                      tokens.
                    </p>
                    <p>
                      Readings included:{" "}
                      {readingMetrics
                        .map((metric) => `${metric.label} (${metric.unit})`)
                        .join(", ")}
                      .
                    </p>
                  </Panel>
                </>
              )}
            </>
          );
        }}
      </AsyncView>
    </div>
  );
}
