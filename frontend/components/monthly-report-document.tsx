import { Waves } from "lucide-react";
import {
  monthLabel,
  REPORT_BASIS,
  REPORT_COVERAGE,
  type MonthlyReport,
} from "@/lib/reports";
import { dateTime, money, usdMoney, statusLabels } from "@/lib/format";
import { INR_RATE_NOTE } from "@/lib/currency";

export function MonthlyReportDocument({
  report,
  source,
  generatedAt,
}: {
  report: MonthlyReport;
  source: string;
  generatedAt: string;
}) {
  const statuses = [...new Set(report.bounties.map((item) => item.status))];
  const payoutStatuses = [
    ...new Set(report.payouts.map((item) => item.status)),
  ];
  const reference = `RM-${report.month.replace("-", "")}`;
  return (
    <article
      className="report-document"
      aria-label="Printable monthly river report"
    >
      <section className="report-sheet">
        <header className="document-masthead">
          <span>
            <Waves size={25} />
            RiverMind
          </span>
          <small>RIVER MONITORING / MONTHLY REVIEW</small>
        </header>
        <div className="document-title">
          <p>YAMUNA · DELHI REACH</p>
          <h1>Monthly river report</h1>
          <h2>{monthLabel(report.month)}</h2>
        </div>
        <dl className="document-meta">
          <div>
            <dt>Reference</dt>
            <dd>{reference}</dd>
          </div>
          <div>
            <dt>Reporting timezone</dt>
            <dd>Asia/Kolkata · IST</dd>
          </div>
          <div>
            <dt>Snapshot loaded</dt>
            <dd>{dateTime(generatedAt)}</dd>
          </div>
          <div>
            <dt>Data source</dt>
            <dd>{source}</dd>
          </div>
        </dl>
        <div className="document-scope">
          <strong>Scope of this report</strong>
          <p>{REPORT_COVERAGE}</p>
        </div>
        <section className="document-section">
          <h2>
            <span>01</span>Executive summary
          </h2>
          <table>
            <thead>
              <tr>
                <th>Measure</th>
                <th>Available records / value</th>
                <th>Basis</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Water readings</th>
                <td>{report.readings.length}</td>
                <td>
                  {report.simulatedReadings} simulated;{" "}
                  {report.readings.length - report.simulatedReadings} device
                </td>
              </tr>
              <tr>
                <th>Pollution signals</th>
                <td>{report.events.length}</td>
                <td>Events created in this month</td>
              </tr>
              <tr>
                <th>Cleanup quests</th>
                <td>{report.bounties.length}</td>
                <td>Quests created in this month</td>
              </tr>
              <tr>
                <th>Captured donations</th>
                <td>
                  {money(report.donatedCents)}
                  <small>
                    {usdMoney(report.donatedCents)} USD source value
                  </small>
                </td>
                <td>{report.donations.length} returned contributions</td>
              </tr>
              <tr>
                <th>Successful payouts</th>
                <td>
                  {money(report.succeededPayoutCents)}
                  <small>
                    {usdMoney(report.succeededPayoutCents)} USD source value
                  </small>
                </td>
                <td>Created this month; currently successful</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className="document-section">
          <h2>
            <span>02</span>Water measurement summary
          </h2>
          <table>
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Unit</th>
                <th>Average</th>
                <th>Minimum</th>
                <th>Maximum</th>
              </tr>
            </thead>
            <tbody>
              {report.sensorStats.map((item) => (
                <tr key={item.key}>
                  <th>{item.label}</th>
                  <td>{item.unit}</td>
                  <td>{item.average?.toFixed(2) ?? "Not available"}</td>
                  <td>{item.min ?? "—"}</td>
                  <td>{item.max ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="document-note">
            Statistics describe returned samples, including simulated readings.
            They do not establish water safety or represent a continuous monthly
            measurement series.
          </p>
        </section>
        <footer className="document-footer">
          <span>{reference} · Available-record summary</span>
          <span>RiverMind / Overview</span>
        </footer>
      </section>
      <section className="report-sheet">
        <header className="document-masthead">
          <span>
            <Waves size={25} />
            RiverMind
          </span>
          <small>{monthLabel(report.month)} / ACTIVITY & METHODOLOGY</small>
        </header>
        <section className="document-section">
          <h2>
            <span>03</span>Signal breakdown
          </h2>
          <table>
            <thead>
              <tr>
                <th>Signal type</th>
                <th>Count</th>
                <th>Interpretation</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Waste detections</th>
                <td>
                  {report.events.filter((item) => item.type === "WASTE").length}
                </td>
                <td>Returned waste-event records</td>
              </tr>
              <tr>
                <th>Sensor anomalies</th>
                <td>
                  {
                    report.events.filter(
                      (item) => item.type === "SENSOR_ANOMALY",
                    ).length
                  }
                </td>
                <td>Returned sensor-anomaly records</td>
              </tr>
            </tbody>
          </table>
        </section>
        <div className="document-columns">
          <section className="document-section">
            <h2>
              <span>04</span>Cleanup status
            </h2>
            <table>
              <thead>
                <tr>
                  <th>Current status</th>
                  <th>Quests</th>
                </tr>
              </thead>
              <tbody>
                {statuses.map((status) => (
                  <tr key={status}>
                    <th>{statusLabels[status] ?? status}</th>
                    <td>
                      {
                        report.bounties.filter((item) => item.status === status)
                          .length
                      }
                    </td>
                  </tr>
                ))}
                {!statuses.length && (
                  <tr>
                    <td colSpan={2}>No returned quests in this month.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
          <section className="document-section">
            <h2>
              <span>05</span>Payout status
            </h2>
            <table>
              <thead>
                <tr>
                  <th>Current status</th>
                  <th>Count</th>
                  <th>USD source value</th>
                </tr>
              </thead>
              <tbody>
                {payoutStatuses.map((status) => {
                  const items = report.payouts.filter(
                    (item) => item.status === status,
                  );
                  return (
                    <tr key={status}>
                      <th>{statusLabels[status] ?? status}</th>
                      <td>{items.length}</td>
                      <td>
                        {usdMoney(
                          items.reduce(
                            (sum, item) => sum + item.amount_cents,
                            0,
                          ),
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!payoutStatuses.length && (
                  <tr>
                    <td colSpan={3}>No returned payouts in this month.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </div>
        <section className="document-section">
          <h2>
            <span>06</span>Methodology & interpretation
          </h2>
          <ol className="document-method">
            <li>{REPORT_BASIS}</li>
            <li>{INR_RATE_NOTE}</li>
            <li>
              All source amounts and CSV exports retain integer USD cents. INR
              values are display estimates, not historical exchange valuations
              or settlement amounts.
            </li>
            <li>
              Mock results and simulated samples remain labelled. No real money
              moves in the sandbox prototype, and the river indicator is not a
              certified water-quality assessment.
            </li>
            <li>
              Exports omit names, email addresses and private session or claim
              tokens. The CSV contains the underlying returned records for
              further review.
            </li>
          </ol>
        </section>
        <div className="document-scope">
          <strong>Coverage matters</strong>
          <p>
            Missing records do not prove there was no activity. Current quest
            and payout statuses must not be interpreted as month-end historical
            statuses. A successful payout in this cohort does not establish when
            the payment completed.
          </p>
        </div>
        <footer className="document-footer">
          <span>{reference} · PayPal sandbox prototype</span>
          <span>RiverMind / Activity & notes</span>
        </footer>
      </section>
    </article>
  );
}
