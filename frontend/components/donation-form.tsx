"use client";
import { useRef, useState } from "react";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Heart, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { money, parseDonation } from "@/lib/format";
import { useHealth } from "@/lib/queries";
import { Button } from "./ui/button";
import { ErrorNotice, Notice, Panel, PanelTitle, Skeleton } from "./ui/shared";
export function DonationForm() {
  const health = useHealth(),
    cache = useQueryClient();
  const [amount, setAmount] = useState("15"),
    [name, setName] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState<number>();
  const operation = useRef<{ key: string; orderId?: string } | undefined>(
    undefined,
  );
  let cents: number | undefined;
  let validation = "";
  try {
    cents = parseDonation(amount);
  } catch (e) {
    validation = (e as Error).message;
  }
  const simulated =
    api.mode === "fixture" || health.data?.paypal_mode === "mock";
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const resetOperation = () => {
    operation.current = undefined;
    setError("");
  };
  const createOrder = async () => {
    const amount_cents = parseDonation(amount);
    operation.current ??= { key: crypto.randomUUID() };
    if (operation.current.orderId) return operation.current.orderId;
    const order = await api.createDonationOrder(
      { amount_cents, ...(name.trim() ? { donor_name: name.trim() } : {}) },
      { idempotencyKey: operation.current.key },
    );
    operation.current.orderId = order.order_id;
    return order.order_id;
  };
  const capture = async (id: string) => {
    const result = await api.captureDonation(id);
    setSuccess(result.donation.amount_cents);
    for (const key of ["river", "donations", "payouts"])
      void cache.invalidateQueries({ queryKey: [key] });
  };
  async function simulate() {
    setPending(true);
    setError("");
    try {
      await capture(await createOrder());
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The donation could not be completed.",
      );
    } finally {
      setPending(false);
    }
  }
  if (success !== undefined)
    return (
      <Panel className="donation-success">
        <span className="success-symbol">
          <Check size={30} strokeWidth={1.5} />
        </span>
        <h2>A little care, carried forward.</h2>
        <p>
          {money(success)} USD has been captured in the{" "}
          {simulated ? "simulated" : "sandbox"} treasury.
        </p>
        <Notice success>
          No real money moved. The public contribution record and treasury have
          been refreshed.
        </Notice>
        <Button
          variant="secondary"
          onClick={() => {
            setSuccess(undefined);
            resetOperation();
          }}
        >
          Make another contribution
          <Heart size={15} />
        </Button>
      </Panel>
    );
  return (
    <Panel className="donation-form">
      <PanelTitle aside={<Heart size={19} className="text-accent" />}>
        Keep the next chapter flowing.
      </PanelTitle>
      <p className="form-intro">
        Choose a contribution to the river’s shared treasury. Funds support
        posted cleanup rewards through the backend’s budget and verification
        rules.
      </p>
      <fieldset disabled={pending}>
        <legend className="form-legend">Choose an amount · USD</legend>
        <div className="donation-presets">
          {[5, 15, 25, 50].map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={amount === String(value)}
              onClick={() => {
                setAmount(String(value));
                resetOperation();
              }}
            >
              ${value}
            </button>
          ))}
        </div>
        <div className="form-field">
          <label htmlFor="donation-amount">Your amount in USD</label>
          <div className="currency-input">
            <span>$</span>
            <input
              id="donation-amount"
              type="text"
              inputMode="decimal"
              className="field"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                resetOperation();
              }}
              aria-invalid={!!validation}
              aria-describedby="donation-amount-help"
              required
            />
          </div>
          <small id="donation-amount-help">
            {validation ||
              "Between $1 and $1,000 USD. Up to two decimal places."}
          </small>
        </div>
        <div className="form-field">
          <label htmlFor="donor-name">
            Name on the public contribution record{" "}
            <span className="optional">(optional)</span>
          </label>
          <input
            id="donor-name"
            className="field"
            maxLength={60}
            autoComplete="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              resetOperation();
            }}
            placeholder="Leave blank to remain unnamed"
          />
          <small>
            This name is public. Your PayPal account details are not shown in
            the ledger.
          </small>
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {health.isPending && api.mode !== "fixture" ? (
        <Skeleton lines={2} />
      ) : health.isError && api.mode !== "fixture" ? (
        <ErrorNotice error={health.error} retry={() => void health.refetch()} />
      ) : simulated ? (
        <>
          <Notice>
            This is a simulated donation. The demo calls mock order creation and
            capture; no PayPal checkout or real transfer takes place.
          </Notice>
          <Button
            className="donation-submit"
            disabled={pending || cents === undefined}
            onClick={() => void simulate()}
          >
            {pending
              ? "Recording your contribution…"
              : `Simulated donation${cents ? ` · ${money(cents)}` : ""}`}
            <Heart size={16} />
          </Button>
        </>
      ) : clientId ? (
        <PayPalScriptProvider
          options={{ clientId, currency: "USD", intent: "capture" }}
        >
          <div className="paypal-checkout">
            <p className="tiny-label">
              PAYPAL SANDBOX CHECKOUT · NO REAL MONEY
            </p>
            <PayPalButtons
              disabled={cents === undefined || pending}
              forceReRender={[cents, name]}
              style={{
                layout: "vertical",
                color: "gold",
                shape: "rect",
                label: "donate",
              }}
              createOrder={async () => {
                setError("");
                setPending(true);
                try {
                  return await createOrder();
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Could not create checkout.",
                  );
                  setPending(false);
                  throw e;
                }
              }}
              onApprove={async (data) => {
                try {
                  await capture(data.orderID);
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Could not confirm the donation.",
                  );
                } finally {
                  setPending(false);
                }
              }}
              onCancel={() => {
                setPending(false);
                resetOperation();
                setError(
                  "Checkout was cancelled. No donation has been confirmed.",
                );
              }}
              onError={() => {
                setPending(false);
                setError(
                  "PayPal checkout could not complete. You can retry or review the ledger for a captured donation.",
                );
              }}
            />
          </div>
        </PayPalScriptProvider>
      ) : (
        <Notice>
          Sandbox checkout isn’t configured yet. You can still explore the
          public treasury and cleanup records.
        </Notice>
      )}
      <p className="donation-footnote">
        <ShieldCheck size={14} />
        USD sandbox prototype · No real-money donations
      </p>
    </Panel>
  );
}
