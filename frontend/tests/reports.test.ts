import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as contract from "@/lib/contracts";
import {
  buildMonthlyReport,
  istDay,
  monthlyReportCsv,
  recentSignalDays,
  type ReportRecords,
} from "@/lib/reports";

function fixture(name: string) {
  return JSON.parse(
    readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), "utf8"),
  );
}
const records: ReportRecords = {
  readings: contract.readingsSchema.parse(fixture("readings.ok.json")).items,
  events: contract.eventsSchema.parse(fixture("events.ok.json")).items,
  bounties: contract.bountiesSchema.parse(fixture("bounties.ok.json")).items,
  payouts: contract.payoutsSchema.parse(fixture("payouts.ok.json")).items,
  donations: contract.donationsSchema.parse(fixture("donations.ok.json")).items,
};

describe("monthly available-record reports", () => {
  it("uses IST boundaries rather than UTC or the browser timezone", () => {
    expect(istDay("2026-10-31T18:29:59Z")).toBe("2026-10-31");
    expect(istDay("2026-10-31T18:30:00Z")).toBe("2026-11-01");
    const report = buildMonthlyReport(
      {
        ...records,
        donations: [
          {
            ...records.donations[0],
            amount_cents: 101,
            created_at: "2026-10-31T18:30:00Z",
          },
          {
            ...records.donations[1],
            amount_cents: 299,
            created_at: "2026-11-30T18:30:00Z",
          },
        ],
      },
      "2026-11",
    );
    expect(report.donatedCents).toBe(101);
    expect(report.daily).toHaveLength(30);
    expect(buildMonthlyReport(records, "2028-02").daily).toHaveLength(29);
  });

  it("sums exact cents and only current successful payouts in the creation cohort", () => {
    const report = buildMonthlyReport(
      {
        ...records,
        payouts: [
          ...records.payouts,
          {
            ...records.payouts[2],
            id: "outside-month",
            amount_cents: 9999,
            created_at: "2026-10-31T10:00:00Z",
            updated_at: "2026-11-10T10:00:00Z",
          },
        ],
      },
      "2026-11",
    );
    expect(report.donatedCents).toBe(2500);
    expect(report.succeededPayoutCents).toBe(1500);
    expect(report.events).toHaveLength(2);
    expect(report.daily.find((day) => day.date === "2026-11-10")).toMatchObject(
      { waste: 1, sensor: 1 },
    );
    expect(report.simulatedReadings).toBe(3);
    expect(report.sensorStats[0].average).toBeCloseTo(57.5);
  });

  it("does not turn missing readings into zero measurements", () => {
    const report = buildMonthlyReport(records, "2026-10");
    expect(report.totalRecords).toBe(0);
    expect(
      report.sensorStats.every(
        (metric) =>
          metric.average === null && metric.min === null && metric.max === null,
      ),
    ).toBe(true);
    expect(() => buildMonthlyReport(records, "2026-13")).toThrow(
      "Choose a valid month",
    );
  });

  it("includes coverage and simulation labels in CSV, protects cells, and omits personal data", () => {
    const report = buildMonthlyReport(records, "2026-11");
    const csv = monthlyReportCsv(
      report,
      '=HYPERLINK("test")',
      "2026-11-10T10:00:00Z",
    );
    expect(csv).toContain("not a complete monthly archive");
    expect(csv).toContain("not historical month-end statuses");
    expect(csv).toContain("Simulated");
    expect(csv).toContain('"\'=HYPERLINK(""test"")"');
    expect(csv).toContain('1500,"USD cents"');
    expect(csv).not.toContain("@example.com");
    expect(csv).not.toContain("Meera");
    expect(csv).not.toContain("claim_token");
  });

  it("keeps seven IST dates across a month boundary and excludes older events", () => {
    const days = recentSignalDays(
      records.events,
      new Date("2026-11-01T20:00:00Z"),
    );
    expect(days).toHaveLength(7);
    expect(days[0].date).toBe("2026-10-27");
    expect(days[6].date).toBe("2026-11-02");
    expect(days.reduce((sum, day) => sum + day.waste + day.sensor, 0)).toBe(0);
  });
});
