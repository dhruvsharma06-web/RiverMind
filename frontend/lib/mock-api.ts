/** Explicit browser-session simulation. This module never calls payment or AI services. */
import type { Bounty, Donation, Payout, RiverStatus, Proof } from "./contracts";
type Loader = (name: string) => Promise<unknown>;
interface DemoState {
  bounties: Bounty[];
  payouts: Payout[];
  donations: Donation[];
  river: RiverStatus;
  tokens: Record<string, string>;
  orders: Record<string, { donation: Donation; captured: boolean }>;
  operations: Record<string, { fingerprint: string; response: unknown }>;
}
const storageKey = "rivermind:demo:v1";
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const error = (code: string, message: string, status: number) =>
  reply({ error: { code, message, details: {} } }, status);

export function createMockTransport(
  load: Loader,
  storage?: Pick<Storage, "getItem" | "setItem">,
) {
  let state: DemoState | undefined;
  let initialization: Promise<DemoState> | undefined;
  const persist = () => {
    try {
      storage?.setItem(storageKey, JSON.stringify(state));
    } catch {
      /* Memory-only demo is supported. */
    }
  };
  async function initialize(): Promise<DemoState> {
    try {
      const saved = storage?.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as DemoState;
        if (
          Array.isArray(parsed.bounties) &&
          Array.isArray(parsed.payouts) &&
          parsed.operations &&
          parsed.river?.treasury &&
          parsed.tokens &&
          parsed.orders
        )
          return parsed;
      }
    } catch {
      /* Start a new demo if browser storage is unavailable. */
    }
    const [bounties, payouts, donations, river, proof] = (await Promise.all([
      load("bounties.ok.json"),
      load("payouts.ok.json"),
      load("donations.ok.json"),
      load("river_status.ok.json"),
      load("proof.verified.json"),
    ])) as [
      { items: Bounty[] },
      { items: Payout[] },
      { items: Donation[] },
      RiverStatus,
      Proof,
    ];
    const result: DemoState = structuredClone({
      bounties: bounties.items,
      payouts: payouts.items,
      donations: donations.items,
      river,
      tokens: {},
      orders: {},
      operations: {},
    });
    // Fixtures are independent examples. Isolate council scenarios from the
    // unrelated open/rejected fixtures so the simulated journey is coherent.
    for (const [index, payout] of result.payouts
      .filter((p) => p.status !== "SUCCEEDED")
      .entries()) {
      const id = `5d7c1e2f-3a4b-4c5d-9e8f-1a2b3c4d5e6${index + 4}`;
      const original = result.bounties[0];
      payout.bounty_id = id;
      result.bounties.push({
        ...structuredClone(original),
        id,
        title:
          index === 0
            ? "Restore the riverside steps"
            : "Clear trapped litter at the riverbank",
        amount_cents: payout.amount_cents,
        status:
          payout.status === "FAILED"
            ? "PAYOUT_FAILED"
            : "PAYOUT_PENDING_APPROVAL",
        worker_name: "Demo Guardian",
        claimed_at: original.created_at,
        expires_at: null,
        verification: { ...structuredClone(proof.verification), bounty_id: id },
        payout,
      });
      result.river.treasury.reserved_cents += payout.amount_cents;
      result.river.treasury.available_cents -= payout.amount_cents;
    }
    result.bounties.forEach((b) => {
      b.expires_at = null;
    });
    return result;
  }
  return async function handle(
    path: string,
    options: {
      method?: string;
      body?: object | FormData;
      headers?: Record<string, string>;
    },
    fallback: string,
  ): Promise<Response> {
    initialization ??= initialize().catch((error) => {
      initialization = undefined;
      throw error;
    });
    state ??= await initialization;
    const s = state,
      url = new URL(path, "https://demo.example.test"),
      parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent),
      post = options.method === "POST",
      now = new Date().toISOString();
    const body = options.body as Record<string, unknown> | undefined;
    if (
      post &&
      parts[0] === "payouts" &&
      (!options.headers?.Authorization?.startsWith("Bearer ") ||
        options.headers.Authorization.length < 8)
    )
      return error("UNAUTHORIZED", "Enter a demo council key first.", 401);
    const key = options.headers?.["Idempotency-Key"],
      fingerprint = `${path}:${JSON.stringify(body ?? {})}`;
    if (key && s.operations[key]) {
      const old = s.operations[key];
      return old.fingerprint === fingerprint
        ? reply(old.response)
        : error(
            "IDEMPOTENCY_CONFLICT",
            "This demo key was already used for a different operation.",
            409,
          );
    }
    const respond = (data: unknown) => {
      if (key)
        s.operations[key] = { fingerprint, response: structuredClone(data) };
      s.river.updated_at = now;
      persist();
      return reply(data);
    };
    const pay = (payout: Payout) => {
      payout.status = "SUCCEEDED";
      payout.updated_at = now;
      payout.paypal_batch_id = `MOCK-${payout.id}`;
      payout.paypal_item_id = `MOCK-ITEM-${payout.id}`;
      const bounty = s.bounties.find((b) => b.id === payout.bounty_id);
      if (bounty) {
        bounty.status = "PAID";
        bounty.payout = payout;
        bounty.updated_at = now;
      }
      s.river.treasury.reserved_cents -= payout.amount_cents;
      s.river.treasury.paid_cents += payout.amount_cents;
    };
    if (!post && parts[0] === "river")
      return reply({
        ...s.river,
        open_bounties: s.bounties.filter((b) =>
          ["OPEN", "CLAIMED", "PROOF_SUBMITTED"].includes(b.status),
        ).length,
      });
    if (!post && parts[0] === "bounties") {
      if (parts[1]) {
        const bounty = s.bounties.find((b) => b.id === parts[1]);
        return bounty
          ? reply(bounty)
          : error("NOT_FOUND", "This quest does not exist.", 404);
      }
      return reply({
        items: s.bounties.filter(
          (b) =>
            !url.searchParams.get("status") ||
            b.status === url.searchParams.get("status"),
        ),
      });
    }
    if (post && parts[0] === "bounties") {
      const bounty = s.bounties.find((b) => b.id === parts[1]);
      if (!bounty) return error("NOT_FOUND", "This quest does not exist.", 404);
      if (parts[2] === "claim") {
        if (bounty.status !== "OPEN")
          return error(
            "INVALID_STATE",
            "This quest has already been claimed.",
            409,
          );
        const name = String(body?.worker_name ?? "").trim(),
          email = String(body?.paypal_email ?? "");
        if (
          !name ||
          name.length > 60 ||
          !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
        )
          return error(
            "VALIDATION_ERROR",
            "Enter your name and a valid sandbox email.",
            422,
          );
        bounty.status = "CLAIMED";
        bounty.worker_name = name;
        bounty.claimed_at = now;
        bounty.updated_at = now;
        const token = `ct_demo_${crypto.randomUUID()}`;
        s.tokens[bounty.id] = token;
        return respond({ bounty, claim_token: token });
      }
      if (parts[2] === "proof") {
        if (
          !s.tokens[bounty.id] ||
          options.headers?.["X-Claim-Token"] !== s.tokens[bounty.id]
        )
          return error(
            "UNAUTHORIZED",
            "Restore the claim token for this quest.",
            401,
          );
        if (bounty.status !== "CLAIMED")
          return error(
            "INVALID_STATE",
            "This quest is no longer accepting proof.",
            409,
          );
        const form = options.body as FormData,
          before = form.get("before") as File | null,
          after = form.get("after") as File | null;
        if (!before || !after)
          return error("VALIDATION_ERROR", "Both photos are required.", 422);
        bounty.status = "PROOF_SUBMITTED";
        const first = new Uint8Array(await before.arrayBuffer()),
          second = new Uint8Array(await after.arrayBuffer());
        const duplicate =
          first.length === second.length &&
          first.every((byte, i) => byte === second[i]);
        const example = (await load(
          duplicate ? "proof.rejected_duplicate.json" : "proof.verified.json",
        ).catch((error) => {
          bounty.status = "CLAIMED";
          throw error;
        })) as Proof;
        const verification = {
          ...structuredClone(example.verification),
          id: crypto.randomUUID(),
          bounty_id: bounty.id,
          created_at: now,
        };
        verification.explanation = `Simulated verification — predefined demo checks, not AI analysis. ${verification.explanation}`;
        bounty.verification = verification;
        bounty.updated_at = now;
        if (duplicate) {
          bounty.status = "REJECTED";
          bounty.rejection_reason = "duplicate photo";
          s.river.treasury.reserved_cents -= bounty.amount_cents;
          s.river.treasury.available_cents += bounty.amount_cents;
        } else {
          const payout: Payout = {
            id: crypto.randomUUID(),
            bounty_id: bounty.id,
            amount_cents: bounty.amount_cents,
            currency: "USD",
            status: "PENDING_APPROVAL",
            receiver_masked: "de***@example.test",
            paypal_batch_id: null,
            paypal_item_id: null,
            created_at: now,
            updated_at: now,
          };
          bounty.payout = payout;
          s.payouts.unshift(payout);
          bounty.status = "PAYOUT_PENDING_APPROVAL";
          if (bounty.amount_cents <= 2000) pay(payout);
        }
        return respond({ bounty, verification });
      }
    }
    if (!post && parts[0] === "payouts")
      return reply({
        items: s.payouts.filter(
          (p) =>
            !url.searchParams.get("status") ||
            p.status === url.searchParams.get("status"),
        ),
        totals: {
          paid_cents: s.river.treasury.paid_cents,
          pending_cents: s.payouts
            .filter((p) =>
              ["PENDING_APPROVAL", "QUEUED", "SENDING", "SENT"].includes(
                p.status,
              ),
            )
            .reduce((sum, p) => sum + p.amount_cents, 0),
        },
      });
    if (post && parts[0] === "payouts") {
      if (
        !options.headers?.Authorization?.startsWith("Bearer ") ||
        options.headers.Authorization.length < 8
      )
        return error("UNAUTHORIZED", "Enter a demo council key first.", 401);
      const payout = s.payouts.find((p) => p.id === parts[1]);
      if (!payout) return error("NOT_FOUND", "Payout not found.", 404);
      if (
        (parts[2] === "approve" || parts[2] === "veto") &&
        payout.status !== "PENDING_APPROVAL"
      )
        return error(
          "INVALID_STATE",
          "This payout is no longer awaiting approval.",
          409,
        );
      if (parts[2] === "retry" && payout.status !== "FAILED")
        return error(
          "INVALID_STATE",
          "Only failed payouts can be retried.",
          409,
        );
      if (parts[2] === "veto") {
        const reason = String(body?.reason ?? "").trim();
        if (!reason || reason.length > 500)
          return error(
            "VALIDATION_ERROR",
            "Enter a reason, up to 500 characters.",
            422,
          );
        payout.status = "VETOED";
        payout.updated_at = now;
        const bounty = s.bounties.find((b) => b.id === payout.bounty_id)!;
        bounty.status = "REJECTED";
        bounty.rejection_reason = `COUNCIL_VETO: ${reason}`;
        bounty.payout = payout;
        s.river.treasury.reserved_cents -= payout.amount_cents;
        s.river.treasury.available_cents += payout.amount_cents;
        return respond({ payout, bounty });
      }
      pay(payout);
      return respond({ payout });
    }
    if (post && parts[0] === "donations" && parts.length === 2) {
      const amount = Number(body?.amount_cents);
      if (!Number.isInteger(amount) || amount < 100 || amount > 100000)
        return error(
          "VALIDATION_ERROR",
          "Donate between $1 and $1,000 USD.",
          422,
        );
      const donation: Donation = {
        id: crypto.randomUUID(),
        amount_cents: amount,
        currency: "USD",
        donor_name: body?.donor_name
          ? String(body.donor_name).slice(0, 60)
          : null,
        created_at: now,
      };
      const orderId = `MOCK-ORDER-${crypto.randomUUID()}`;
      s.orders[orderId] = { donation, captured: false };
      return respond({ donation_id: donation.id, order_id: orderId });
    }
    if (post && parts[0] === "donations" && parts[3] === "capture") {
      const order = s.orders[parts[2]];
      if (!order)
        return error(
          "NOT_FOUND",
          "Donation order not found in this demo session.",
          404,
        );
      if (!order.captured) {
        order.captured = true;
        s.donations.unshift(order.donation);
        s.river.treasury.donated_cents += order.donation.amount_cents;
        s.river.treasury.available_cents += order.donation.amount_cents;
      }
      return respond({ donation: { ...order.donation, status: "CAPTURED" } });
    }
    if (!post && parts[0] === "donations")
      return reply({
        items: s.donations.slice(
          0,
          Number(url.searchParams.get("limit") ?? 20),
        ),
        total_cents: s.river.treasury.donated_cents,
      });
    return reply(await load(fallback));
  };
}
