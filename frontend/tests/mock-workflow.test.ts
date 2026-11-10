import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createMockTransport } from "@/lib/mock-api";
import * as contract from "@/lib/contracts";
const load = async (name: string): Promise<unknown> =>
  JSON.parse(
    readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), "utf8"),
  );
const uuid = "4837f842-176e-4293-bdcb-a85c50a08691";
const headers = {
  Authorization: "Bearer local-demo-key",
  "Idempotency-Key": uuid,
};
function setup() {
  const saved = new Map<string, string>();
  const storage = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => {
      saved.set(key, value);
    },
  };
  const raw = createMockTransport(load, storage);
  let token: Promise<string> | undefined;
  // Claims, proofs and donations need a signed-in worker, as in the real API.
  const transport = (async (
    path: string,
    options: Parameters<typeof raw>[1],
    fallback: string,
  ) => {
    if (
      options.method === "POST" &&
      /^\/(bounties|donations)\//.test(path) &&
      !options.headers?.Authorization
    ) {
      token ??= raw(
        "/auth/register",
        {
          method: "POST",
          body: {
            name: "Test Worker",
            email: "w@example.test",
            password: "password-1",
          },
        },
        "health.ok.json",
      )
        .then((r) => r.json())
        .then((j) => j.token as string);
      options = {
        ...options,
        headers: { ...options.headers, Authorization: `Bearer ${await token}` },
      };
    }
    return raw(path, options, fallback);
  }) as typeof raw;
  return { transport, raw, storage, saved };
}
const getOpen = async (transport: ReturnType<typeof createMockTransport>) =>
  contract.bountiesSchema.parse(
    await (
      await transport("/bounties?status=OPEN", {}, "bounties.ok.json")
    ).json(),
  ).items[0];
async function claim(
  transport: ReturnType<typeof createMockTransport>,
  id: string,
) {
  return contract.claimSchema.parse(
    await (
      await transport(
        `/bounties/${id}/claim`,
        {
          method: "POST",
          body: {
            worker_name: "Test Guardian",
            paypal_email: "private-demo@example.test",
          },
        },
        "claim.ok.json",
      )
    ).json(),
  );
}
function proofForm(duplicate = false) {
  const form = new FormData();
  form.set(
    "before",
    new File(["before test bytes"], "before.jpg", { type: "image/jpeg" }),
  );
  form.set(
    "after",
    new File(
      [duplicate ? "before test bytes" : "different after bytes"],
      "after.jpg",
      { type: "image/jpeg" },
    ),
  );
  return form;
}
describe("demo auth", () => {
  const call = (
    t: ReturnType<typeof createMockTransport>,
    path: string,
    body?: object,
    headers?: Record<string, string>,
  ) =>
    t(path, { method: body ? "POST" : "GET", body, headers }, "health.ok.json");
  it("registers, signs in, validates the session, and signs out", async () => {
    const { raw } = setup();
    const created = await call(raw, "/auth/register", {
      name: "Rae",
      email: "Rae@Example.test",
      password: "long-enough",
    });
    expect(created.status).toBe(201);
    const { user, token } = contract.authSessionSchema.parse(
      await created.json(),
    );
    expect(user.role).toBe("worker");
    expect(token.startsWith("st_")).toBe(true);
    const bearer = { Authorization: `Bearer ${token}` };
    expect((await call(raw, "/auth/me", undefined, bearer)).status).toBe(200);
    expect(
      (
        await call(raw, "/auth/register", {
          name: "R",
          email: "rae@example.test",
          password: "long-enough",
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call(raw, "/auth/login", {
          email: "rae@example.test",
          password: "wrong-pass",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await call(raw, "/auth/login", {
          email: "rae@example.test",
          password: "long-enough",
        })
      ).status,
    ).toBe(200);
    expect((await call(raw, "/auth/logout", {}, bearer)).status).toBe(204);
    expect((await call(raw, "/auth/me", undefined, bearer)).status).toBe(401);
  });
  it("stores only a SHA-256 digest of the password", async () => {
    const { raw, saved } = setup();
    await call(raw, "/auth/register", {
      name: "Rae",
      email: "rae@example.test",
      password: "plain-secret-1",
    });
    const stored = [...saved.values()].join("");
    expect(stored).not.toContain("plain-secret-1");
    expect(stored).toMatch(/"hash":"[0-9a-f]{64}"/);
  });
  it("seeds a demo council account and rejects unauthenticated claims", async () => {
    const { raw } = setup();
    const login = await call(raw, "/auth/login", {
      email: "council@demo.rivermind",
      password: "council-demo",
    });
    expect(contract.authSessionSchema.parse(await login.json()).user.role).toBe(
      "council",
    );
    const open = await getOpen(raw);
    const res = await raw(
      `/bounties/${open.id}/claim`,
      {
        method: "POST",
        body: { worker_name: "A", paypal_email: "a@example.test" },
      },
      "claim.ok.json",
    );
    expect(res.status).toBe(401);
    const orders = await raw(
      "/donations/orders",
      { method: "POST", body: { amount_cents: 500 } },
      "donation_order.ok.json",
    );
    expect(orders.status).toBe(401);
  });
  it("lets only council sessions act on payouts with a session token", async () => {
    const { raw } = setup();
    const tokenFor = async (email: string, password: string) =>
      contract.authSessionSchema.parse(
        await (await call(raw, "/auth/login", { email, password })).json(),
      ).token;
    await call(raw, "/auth/register", {
      name: "W",
      email: "w2@example.test",
      password: "password-2",
    });
    const worker = await tokenFor("w2@example.test", "password-2");
    const council = await tokenFor("council@demo.rivermind", "council-demo");
    const payouts = contract.payoutsSchema.parse(
      await (await raw("/payouts", {}, "payouts.ok.json")).json(),
    ).items;
    const target = payouts.find((p) => p.status === "PENDING_APPROVAL")!;
    const approve = (token: string) =>
      raw(
        `/payouts/${target.id}/approve`,
        {
          method: "POST",
          body: {},
          headers: {
            Authorization: `Bearer ${token}`,
            "Idempotency-Key": uuid,
          },
        },
        "payout_approve.ok.json",
      );
    expect((await approve(worker)).status).toBe(403);
    expect((await approve(council)).status).toBe(200);
  });
});
describe("explicit demo workflow", () => {
  it("keeps independent council fixtures separate from open and rejected quests", async () => {
    const { transport } = setup();
    const bounties = contract.bountiesSchema.parse(
      await (await transport("/bounties", {}, "bounties.ok.json")).json(),
    ).items;
    const payouts = contract.payoutsSchema.parse(
      await (await transport("/payouts", {}, "payouts.ok.json")).json(),
    ).items;
    expect(bounties.find((b) => b.status === "OPEN")?.expires_at).toBeNull();
    for (const payout of payouts) {
      const bounty = bounties.find((b) => b.id === payout.bounty_id);
      expect(bounty?.amount_cents).toBe(payout.amount_cents);
      expect(bounty?.payout?.id).toBe(payout.id);
    }
  });
  it("persists a claim across reloads, rejects competing claims, and does not save a raw email", async () => {
    const { transport, storage, saved } = setup();
    const open = await getOpen(transport);
    const result = await claim(transport, open.id);
    expect(result.bounty.status).toBe("CLAIMED");
    const duplicate = await transport(
      `/bounties/${open.id}/claim`,
      {
        method: "POST",
        body: { worker_name: "Other", paypal_email: "other@example.test" },
      },
      "claim.ok.json",
    );
    expect(duplicate.status).toBe(409);
    const reloaded = createMockTransport(load, storage);
    const bounty = contract.bountySchema.parse(
      await (
        await reloaded(`/bounties/${open.id}`, {}, "bounty.open.json")
      ).json(),
    );
    expect(bounty.worker_name).toBe("Test Guardian");
    expect([...saved.values()].join("")).not.toContain(
      "private-demo@example.test",
    );
  });
  it("simulates verification and one payout, with explicit canned-result wording", async () => {
    const { transport } = setup();
    const open = await getOpen(transport);
    const result = await claim(transport, open.id);
    const response = await transport(
      `/bounties/${open.id}/proof`,
      {
        method: "POST",
        body: proofForm(),
        headers: { "X-Claim-Token": result.claim_token },
      },
      "proof.verified.json",
    );
    const proof = contract.proofSchema.parse(await response.json());
    expect(proof.bounty.status).toBe("PAID");
    expect(proof.verification.explanation).toContain(
      "predefined demo checks, not AI analysis",
    );
    expect(
      (
        await transport(
          `/bounties/${open.id}/proof`,
          {
            method: "POST",
            body: proofForm(),
            headers: { "X-Claim-Token": result.claim_token },
          },
          "proof.verified.json",
        )
      ).status,
    ).toBe(409);
  });
  it("rejects identical demo files and releases the reserved reward", async () => {
    const { transport } = setup();
    const open = await getOpen(transport);
    const initial = contract.riverStatusSchema.parse(
      await (
        await transport("/river/status", {}, "river_status.ok.json")
      ).json(),
    );
    const result = await claim(transport, open.id);
    const proof = contract.proofSchema.parse(
      await (
        await transport(
          `/bounties/${open.id}/proof`,
          {
            method: "POST",
            body: proofForm(true),
            headers: { "X-Claim-Token": result.claim_token },
          },
          "proof.verified.json",
        )
      ).json(),
    );
    expect(proof.bounty.status).toBe("REJECTED");
    const river = contract.riverStatusSchema.parse(
      await (
        await transport("/river/status", {}, "river_status.ok.json")
      ).json(),
    );
    expect(river.treasury.available_cents).toBe(
      initial.treasury.available_cents + open.amount_cents,
    );
  });
  it("rejects a proof token from another claim", async () => {
    const { transport } = setup();
    const open = await getOpen(transport);
    await claim(transport, open.id);
    expect(
      (
        await transport(
          `/bounties/${open.id}/proof`,
          {
            method: "POST",
            body: proofForm(),
            headers: { "X-Claim-Token": "wrong-demo-token" },
          },
          "proof.verified.json",
        )
      ).status,
    ).toBe(401);
  });
  it("creates one order per idempotency key and captures a contribution only once", async () => {
    const { transport } = setup();
    const initial = contract.riverStatusSchema.parse(
      await (
        await transport("/river/status", {}, "river_status.ok.json")
      ).json(),
    );
    const options = {
      method: "POST",
      body: { amount_cents: 1500, donor_name: "Test Donor" },
      headers: { "Idempotency-Key": uuid },
    };
    const first = await (
      await transport("/donations/orders", options, "donation_order.ok.json")
    ).json();
    expect(
      await (
        await transport("/donations/orders", options, "donation_order.ok.json")
      ).json(),
    ).toEqual(first);
    expect(
      (
        await transport(
          "/donations/orders",
          { ...options, body: { amount_cents: 2500 } },
          "donation_order.ok.json",
        )
      ).status,
    ).toBe(409);
    for (let i = 0; i < 2; i++)
      await transport(
        `/donations/orders/${first.order_id}/capture`,
        { method: "POST" },
        "donation_capture.ok.json",
      );
    const river = contract.riverStatusSchema.parse(
      await (
        await transport("/river/status", {}, "river_status.ok.json")
      ).json(),
    );
    expect(river.treasury.donated_cents).toBe(
      initial.treasury.donated_cents + 1500,
    );
  });
  it("authorizes even a replayed council action and never double-pays", async () => {
    const { transport, saved } = setup();
    const pending = contract.payoutsSchema.parse(
      await (
        await transport(
          "/payouts?status=PENDING_APPROVAL",
          {},
          "payouts.ok.json",
        )
      ).json(),
    ).items[0];
    const path = `/payouts/${pending.id}/approve`;
    const first = await (
      await transport(
        path,
        { method: "POST", headers },
        "payout_approve.ok.json",
      )
    ).json();
    expect(
      await (
        await transport(
          path,
          { method: "POST", headers },
          "payout_approve.ok.json",
        )
      ).json(),
    ).toEqual(first);
    expect(
      (
        await transport(
          path,
          { method: "POST", headers: { "Idempotency-Key": uuid } },
          "payout_approve.ok.json",
        )
      ).status,
    ).toBe(401);
    expect([...saved.values()].join("")).not.toContain("local-demo-key");
    const after = contract.payoutsSchema.parse(
      await (await transport("/payouts", {}, "payouts.ok.json")).json(),
    );
    expect(after.items.filter((p) => p.id === pending.id)).toHaveLength(1);
  });
  it("requires a veto reason and closes that quest", async () => {
    const { transport } = setup();
    const pending = contract.payoutsSchema.parse(
      await (
        await transport(
          "/payouts?status=PENDING_APPROVAL",
          {},
          "payouts.ok.json",
        )
      ).json(),
    ).items[0];
    const path = `/payouts/${pending.id}/veto`;
    expect(
      (
        await transport(
          path,
          { method: "POST", headers, body: { reason: " " } },
          "payout_veto.ok.json",
        )
      ).status,
    ).toBe(422);
    const result = contract.payoutVetoSchema.parse(
      await (
        await transport(
          path,
          { method: "POST", headers, body: { reason: "Demo review rejected" } },
          "payout_veto.ok.json",
        )
      ).json(),
    );
    expect(result.payout.status).toBe("VETOED");
    expect(result.bounty.status).toBe("REJECTED");
  });
});
