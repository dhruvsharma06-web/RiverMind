import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import * as contract from "@/lib/contracts";

const fixturesDirectory = fileURLToPath(
  new URL("../../fixtures/", import.meta.url),
);
const files = readdirSync(fixturesDirectory)
  .filter((name) => name.endsWith(".json"))
  .sort();
const schemas: Record<string, z.ZodType> = {
  "health.ok.json": contract.healthSchema,
  "readings.ok.json": contract.readingsSchema,
  "readings.empty.json": contract.readingsSchema,
  "events.ok.json": contract.eventsSchema,
  "events.empty.json": contract.eventsSchema,
  "bounties.ok.json": contract.bountiesSchema,
  "bounties.empty.json": contract.bountiesSchema,
  "bounty.open.json": contract.bountySchema,
  "bounty.paid.json": contract.bountySchema,
  "bounty.rejected.json": contract.bountySchema,
  "claim.ok.json": contract.claimSchema,
  "proof.verified.json": contract.proofSchema,
  "proof.rejected_duplicate.json": contract.proofSchema,
  "media_analyze.ok.json": contract.mediaAnalysisSchema,
  "media_analyze.clean.json": contract.mediaAnalysisSchema,
  "payouts.ok.json": contract.payoutsSchema,
  "payouts.empty.json": contract.payoutsSchema,
  "payout_approve.ok.json": contract.payoutActionSchema,
  "payout_veto.ok.json": contract.payoutVetoSchema,
  "payout_retry.ok.json": contract.payoutActionSchema,
  "donation_order.ok.json": contract.donationOrderSchema,
  "donation_capture.ok.json": contract.donationCaptureSchema,
  "donations.ok.json": contract.donationsSchema,
  "river_status.ok.json": contract.riverStatusSchema,
  "diary.ok.json": contract.diarySchema,
  "fundraise.ok.json": contract.fundraiseSchema,
  "demo_reset.ok.json": contract.resetSchema,
};

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(`${fixturesDirectory}/${name}`, "utf8"));
}

describe("repository fixtures against CONTRACT.md v2", () => {
  it.each(files)("validates %s", (name) => {
    const schema =
      name.startsWith("error.") || name.endsWith(".error.json")
        ? contract.errorResponseSchema
        : schemas[name];
    expect(schema, `No schema registered for ${name}`).toBeDefined();
    const result = schema.safeParse(fixture(name));
    expect(
      result.success,
      result.success ? undefined : JSON.stringify(result.error.issues),
    ).toBe(true);
  });

  it("accepts v2 bounties with no expiry and a missing latest reading", () => {
    const bounty = contract.bountySchema.parse(fixture("bounty.open.json"));
    expect(
      contract.bountySchema.parse({ ...bounty, expires_at: null }).expires_at,
    ).toBeNull();
    const river = contract.riverStatusSchema.parse(
      fixture("river_status.ok.json"),
    );
    expect(
      contract.riverStatusSchema.parse({ ...river, latest_reading: null })
        .latest_reading,
    ).toBeNull();
  });

  it("rejects fractional cents, unsupported currencies, and unknown response fields", () => {
    const bounty = contract.bountySchema.parse(fixture("bounty.open.json"));
    expect(
      contract.bountySchema.safeParse({ ...bounty, amount_cents: 12.5 })
        .success,
    ).toBe(false);
    expect(
      contract.bountySchema.safeParse({ ...bounty, currency: "INR" }).success,
    ).toBe(false);
    expect(
      contract.bountySchema.safeParse({ ...bounty, invented_xp: 500 }).success,
    ).toBe(false);
  });
});
