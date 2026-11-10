import type {
  Bounty,
  Donation,
  Payout,
  Reading,
  RiverEvent,
} from "./contracts";

export const REPORT_COVERAGE =
  "Available-record summary, not a complete monthly archive. The API returns recent readings (up to 200), events (up to 50), donations (up to 20), and available quests and payouts. Missing records are not evidence of no activity.";
export const REPORT_BASIS =
  "Months and days use IST (Asia/Kolkata). Quests, donations and payouts are grouped by creation date. Quest and payout statuses are current at export, not historical month-end statuses. Successful payout amounts do not establish when payment completed.";

export type ReportRecords = {
  readings: Reading[];
  events: RiverEvent[];
  bounties: Bounty[];
  payouts: Payout[];
  donations: Donation[];
};
export type SignalDay = {
  date: string;
  label: string;
  waste: number;
  sensor: number;
};

export function istDay(timestamp: string | number | Date) {
  const value = new Date(timestamp).getTime();
  return Number.isFinite(value)
    ? new Date(value + 330 * 60_000).toISOString().slice(0, 10)
    : "";
}
export function validMonth(month: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}
export function monthLabel(month: string) {
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}
export function signalDays(events: RiverEvent[], dates: string[]): SignalDay[] {
  return dates.map((date) => ({
    date,
    label: new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${date}T00:00:00Z`)),
    waste: events.filter(
      (event) => istDay(event.created_at) === date && event.type === "WASTE",
    ).length,
    sensor: events.filter(
      (event) =>
        istDay(event.created_at) === date && event.type === "SENSOR_ANOMALY",
    ).length,
  }));
}
export function recentSignalDays(events: RiverEvent[], now: Date) {
  const end = Date.parse(`${istDay(now)}T00:00:00Z`);
  return signalDays(
    events,
    Array.from({ length: 7 }, (_, i) =>
      new Date(end - (6 - i) * 86400_000).toISOString().slice(0, 10),
    ),
  );
}
export const readingMetrics = [
  { key: "turbidity_ntu", label: "Turbidity", unit: "NTU" },
  { key: "ph", label: "Water pH", unit: "pH" },
  { key: "tds_ppm", label: "Dissolved solids", unit: "ppm" },
  { key: "temp_c", label: "Temperature", unit: "°C" },
] as const;

export function buildMonthlyReport(records: ReportRecords, month: string) {
  if (!validMonth(month)) throw new Error("Choose a valid month.");
  const inMonth = (date: string) => istDay(date).slice(0, 7) === month;
  const readings = records.readings.filter((r) => inMonth(r.ts));
  const events = records.events.filter((r) => inMonth(r.created_at));
  const bounties = records.bounties.filter((r) => inMonth(r.created_at));
  const payouts = records.payouts.filter((r) => inMonth(r.created_at));
  const donations = records.donations.filter((r) => inMonth(r.created_at));
  const [year, monthNumber] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const daily = signalDays(
    events,
    Array.from(
      { length: days },
      (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
    ),
  );
  const sensorStats = readingMetrics.map((metric) => {
    const values = readings.map((r) => r[metric.key]);
    return {
      ...metric,
      average: values.length
        ? values.reduce((a, b) => a + b, 0) / values.length
        : null,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
    };
  });
  return {
    month,
    readings,
    events,
    bounties,
    payouts,
    donations,
    daily,
    sensorStats,
    totalRecords:
      readings.length +
      events.length +
      bounties.length +
      payouts.length +
      donations.length,
    simulatedReadings: readings.filter((r) => r.simulated).length,
    donatedCents: donations.reduce((sum, r) => sum + r.amount_cents, 0),
    succeededPayoutCents: payouts
      .filter((r) => r.status === "SUCCEEDED")
      .reduce((sum, r) => sum + r.amount_cents, 0),
  };
}
export type MonthlyReport = ReturnType<typeof buildMonthlyReport>;

// Quote text and neutralize spreadsheet formulas, including leading whitespace.
function csvCell(value: string | number) {
  if (typeof value === "number") return String(value);
  const safe =
    /^[\s]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value)
      ? `'${value}`
      : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function monthlyReportCsv(
  report: MonthlyReport,
  source: string,
  generatedAt: string,
) {
  const rows: (string | number)[][] = [
    ["section", "metric_or_id", "date_utc", "value", "unit", "detail"],
    [
      "report",
      "RiverMind monthly report",
      generatedAt,
      report.month,
      "IST month",
      source,
    ],
    ["scope", "coverage", "", "", "", REPORT_COVERAGE],
    ["scope", "date and status basis", "", "", "", REPORT_BASIS],
    [
      "summary",
      "Readings",
      "",
      report.readings.length,
      "records",
      `${report.simulatedReadings} simulated`,
    ],
    [
      "summary",
      "Signals",
      "",
      report.events.length,
      "records",
      "Available events",
    ],
    [
      "summary",
      "Quests created",
      "",
      report.bounties.length,
      "records",
      "Current status",
    ],
    [
      "summary",
      "Donations",
      "",
      report.donatedCents,
      "USD cents",
      "Available captured donations created in month",
    ],
    [
      "summary",
      "Successful payouts",
      "",
      report.succeededPayoutCents,
      "USD cents",
      "Payouts created in month; currently SUCCEEDED",
    ],
  ];
  report.sensorStats.forEach((r) =>
    rows.push([
      "reading_average",
      r.label,
      "",
      r.average ?? "",
      r.unit,
      `Min: ${r.min ?? "unavailable"}; max: ${r.max ?? "unavailable"}`,
    ]),
  );
  report.daily.forEach((r) =>
    rows.push([
      "daily_signals",
      r.date,
      "",
      r.waste + r.sensor,
      "events",
      `Waste: ${r.waste}; sensor: ${r.sensor}. No returned records does not imply no activity.`,
    ]),
  );
  report.readings.forEach((r) =>
    readingMetrics.forEach((metric) =>
      rows.push([
        "reading",
        String(r.seq),
        r.ts,
        r[metric.key],
        metric.unit,
        `${metric.label}; ${r.simulated ? "Simulated" : "Device"}`,
      ]),
    ),
  );
  report.events.forEach((r) =>
    rows.push([
      "event",
      r.id,
      r.created_at,
      r.severity,
      "severity / 5",
      `${r.type}; ${r.summary}`,
    ]),
  );
  report.bounties.forEach((r) =>
    rows.push([
      "quest",
      r.id,
      r.created_at,
      r.amount_cents,
      "USD cents",
      `${r.status}; ${r.title}`,
    ]),
  );
  report.payouts.forEach((r) =>
    rows.push([
      "payout",
      r.id,
      r.created_at,
      r.amount_cents,
      "USD cents",
      r.status,
    ]),
  );
  report.donations.forEach((r) =>
    rows.push([
      "donation",
      r.id,
      r.created_at,
      r.amount_cents,
      "USD cents",
      "Captured donation",
    ]),
  );
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
