import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient } from "@/lib/api";

const origin = "https://api.example.test";
const idempotencyKey = "a12bbfc0-a126-452a-bcfe-a60141174f62";
const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), "utf8"),
  );
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const makeClient = (
  fetcher: typeof fetch,
  overrides: {
    useMock?: boolean;
    timeoutMs?: number;
    aiTimeoutMs?: number;
  } = {},
) =>
  createApiClient({ baseUrl: origin, useMock: false, fetcher, ...overrides });

afterEach(() => vi.useRealTimers());

describe("API transport", () => {
  it("uses the configured origin, versioned path, and encoded query parameters", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json(fixture("readings.ok.json")));
    await makeClient(fetcher).getReadings({
      device_id: "river & station",
      limit: 20,
    });
    expect(fetcher).toHaveBeenCalledWith(
      `${origin}/api/v1/readings?device_id=river+%26+station&limit=20`,
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
      }),
    );
  });

  it.each([
    "https://api.example.test/api/v1",
    "https://api.example.test?key=value",
    "https://user:password@api.example.test",
    "file:///tmp/api",
  ])("rejects a non-origin API setting: %s", (baseUrl) => {
    expect(() => createApiClient({ baseUrl, useMock: false })).toThrow();
  });

  it("preserves a contract error without retrying a claim", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json(fixture("error.invalid_state.json"), 409));
    const request = makeClient(fetcher).claimBounty("bounty-id", {
      worker_name: "Demo Worker",
      paypal_email: "demo@example.test",
    });
    await expect(request).rejects.toBeInstanceOf(ApiError);
    await expect(request).rejects.toMatchObject({
      status: 409,
      code: "INVALID_STATE",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not expose an unstructured server error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("<html>private server diagnostics</html>", {
        status: 502,
      }),
    );
    await expect(makeClient(fetcher).getHealth()).rejects.toMatchObject({
      code: "INTERNAL",
      status: 502,
    });
  });

  it("rejects malformed successful data", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ health_score: "invented" }));
    await expect(makeClient(fetcher).getRiverStatus()).rejects.toMatchObject({
      code: "INTERNAL",
      details: { reason: "INVALID_RESPONSE" },
    });
  });

  it("never falls back to fixtures on a network error", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("offline"));
    await expect(makeClient(fetcher).getHealth()).rejects.toMatchObject({
      status: 0,
      details: { reason: "NETWORK" },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(`${origin}/api/v1/health`);
  });

  it("reads fixtures without forwarding council credentials or mutation payloads", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json(fixture("payout_approve.ok.json")));
    const client = makeClient(fetcher, { useMock: true });
    await client.approvePayout(
      "payout-id",
      { note: "Demo note" },
      { councilKey: "test-only-key", idempotencyKey },
    );
    expect(client.mode).toBe("fixture");
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("/fixtures/payout_approve.ok.json");
    expect(init?.method).toBe("GET");
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
    expect(new Headers(init?.headers).has("Idempotency-Key")).toBe(false);
  });

  it("preserves the caller's idempotency key across donation retries", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => json(fixture("donation_order.ok.json")));
    const client = makeClient(fetcher);
    const body = { amount_cents: 500, donor_name: "Demo Donor" };
    await client.createDonationOrder(body, { idempotencyKey });
    await client.createDonationOrder(body, { idempotencyKey });
    for (const [, init] of fetcher.mock.calls) {
      expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
        idempotencyKey,
      );
      expect(new Headers(init?.headers).get("Content-Type")).toBe(
        "application/json",
      );
      expect(init?.body).toBe(JSON.stringify(body));
    }
  });

  it("sends multipart proof with only the claim header, leaving the boundary to fetch", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json(fixture("proof.verified.json")));
    const before = new File(["test bytes"], "before.jpg", {
      type: "image/jpeg",
    });
    const after = new File(["other test bytes"], "after.png", {
      type: "image/png",
    });
    await makeClient(fetcher).submitProof(
      "bounty/id",
      {
        before,
        after,
        lat: 28.5,
        lon: 77.3,
        before_captured_at: "2026-11-10T10:00:00Z",
        after_captured_at: "2026-11-10T10:01:00Z",
      },
      "test-only-claim",
    );
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`${origin}/api/v1/bounties/bounty%2Fid/proof`);
    const headers = new Headers(init?.headers);
    expect(headers.get("X-Claim-Token")).toBe("test-only-claim");
    expect(headers.has("Content-Type")).toBe(false);
    expect(headers.has("Authorization")).toBe(false);
    expect(init?.body).toBeInstanceOf(FormData);
    const form = init?.body as FormData;
    expect([...form.keys()].sort()).toEqual([
      "after",
      "after_captured_at",
      "before",
      "before_captured_at",
      "lat",
      "lon",
    ]);
    expect(form.get("lat")).toBe("28.5");
    expect((form.get("before") as File).name).toBe("before.jpg");
  });

  it("does not issue a request when already cancelled", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const controller = new AbortController();
    controller.abort();
    await expect(
      makeClient(fetcher).getHealth({ signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps caller cancellation distinct from network failures", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const controller = new AbortController();
    const request = makeClient(fetcher).getHealth({
      signal: controller.signal,
    });
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });

  it("uses a 20-second deadline for ordinary reads", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const request = makeClient(fetcher).getHealth();
    const assertion = expect(request).rejects.toMatchObject({
      details: { reason: "TIMEOUT" },
    });
    await vi.advanceTimersByTimeAsync(19_999);
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
  });

  it("allows 60 seconds for AI analysis", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const request = makeClient(fetcher).analyzeMedia({
      file: new File(["test"], "test.jpg", { type: "image/jpeg" }),
    });
    const assertion = expect(request).rejects.toMatchObject({
      details: { reason: "TIMEOUT" },
    });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(40_000);
    await assertion;
  });
});
