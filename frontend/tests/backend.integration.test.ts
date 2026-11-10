/** Optional real-HTTP checks against the isolated, mock-only frontend QA backend. */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { createApiClient } from "@/lib/api";
const origin = "http://127.0.0.1:8001";
const client = createApiClient({ baseUrl: origin, useMock: false });
describe
  .skipIf(process.env.RIVERMIND_TEST_BACKEND !== "true")
  .sequential("real HTTP transport against P3's mock backend", () => {
    beforeAll(async () => {
      const health = await client.getHealth();
      expect(health.mock_ai).toBe(true);
      expect(health.paypal_mode).toBe("mock");
      const response = await fetch(`${origin}/api/v1/demo/reset`, {
        method: "POST",
        headers: { Authorization: "Bearer frontend-local-demo-only" },
      });
      expect(response.ok).toBe(true);
    });
    it("reads backend seed data and normalizes a missing quest", async () => {
      const river = await client.getRiverStatus();
      expect(river.latest_reading).toBeNull();
      expect((await client.getReadings()).items).toHaveLength(0);
      expect((await client.getEvents()).items.length).toBeGreaterThan(0);
      expect((await client.getDiary()).model_version).toBeTruthy();
      await expect(
        client.getBounty("00000000-0000-4000-8000-000000000000"),
      ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    });
    it("creates and captures one mock donation over HTTP", async () => {
      const initial = await client.getRiverStatus();
      const options = { idempotencyKey: crypto.randomUUID() };
      const body = { amount_cents: 500, donor_name: "HTTP Transport Demo" };
      const order = await client.createDonationOrder(body, options);
      expect(await client.createDonationOrder(body, options)).toEqual(order);
      await client.captureDonation(order.order_id);
      await client.captureDonation(order.order_id);
      expect((await client.getRiverStatus()).treasury.donated_cents).toBe(
        initial.treasury.donated_cents + 500,
      );
    });
    it("claims, uploads multipart evidence, and observes exactly one mock payout", async () => {
      const bounty = (await client.getBounties({ status: "OPEN" })).items[0];
      const claim = await client.claimBounty(bounty.id, {
        worker_name: "HTTP Test Guardian",
        paypal_email: "http-test@example.test",
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const before_captured_at = new Date().toISOString();
      await new Promise((resolve) => setTimeout(resolve, 10));
      const after_captured_at = new Date().toISOString();
      const result = await client.submitProof(
        bounty.id,
        {
          before: new File(
            [
              new Uint8Array(
                readFileSync(
                  new URL("./assets/demo-before.png", import.meta.url),
                ),
              ),
            ],
            "before.png",
            { type: "image/png" },
          ),
          after: new File(
            [
              new Uint8Array(
                readFileSync(
                  new URL("./assets/demo-after.png", import.meta.url),
                ),
              ),
            ],
            "after.png",
            { type: "image/png" },
          ),
          lat: bounty.lat,
          lon: bounty.lon,
          before_captured_at,
          after_captured_at,
        },
        claim.claim_token,
      );
      expect(result.verification.passed).toBe(true);
      expect(result.bounty.status).toBe("PAID");
      expect(
        (await client.getPayouts()).items.filter(
          (p) => p.bounty_id === bounty.id,
        ),
      ).toHaveLength(1);
      await expect(
        client.claimBounty(bounty.id, {
          worker_name: "Another",
          paypal_email: "another@example.test",
        }),
      ).rejects.toMatchObject({ code: "INVALID_STATE", status: 409 });
    });
  });
