"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, RefreshCw, ShieldCheck, X } from "lucide-react";
import { api } from "@/lib/api";
import { usePayouts } from "@/lib/queries";
import { usdMoney as money } from "@/lib/format";
import type { Payout } from "@/lib/contracts";
import { useCouncilSession } from "@/components/session";
import {
  AsyncView,
  EmptyState,
  Notice,
  PageHeading,
  Panel,
  PanelTitle,
  StatusBadge,
} from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
type Action = "approve" | "veto" | "retry";
export default function CouncilPage() {
  const session = useCouncilSession(),
    query = usePayouts(),
    cache = useQueryClient();
  const keys = useRef<Record<string, string>>({});
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const [selection, setSelection] = useState<{
      payout: Payout;
      action: Action;
    }>(),
    [reason, setReason] = useState(""),
    [success, setSuccess] = useState("");
  const confirmOpen = !!selection;
  useEffect(() => {
    if (confirmOpen) reasonRef.current?.focus();
  }, [confirmOpen]);
  const mutation = useMutation({
    meta: {
      successMessage:
        "Council decision accepted. The payment queue has been refreshed.",
    },
    mutationFn: async ({
      payout,
      action,
    }: {
      payout: Payout;
      action: Action;
    }) => {
      const operation = `${payout.id}:${action}`;
      keys.current[operation] ??= crypto.randomUUID();
      const options = {
        councilKey: session.key,
        idempotencyKey: keys.current[operation],
      };
      if (action === "veto")
        return api.vetoPayout(payout.id, { reason: reason.trim() }, options);
      if (action === "retry") return api.retryPayout(payout.id, options);
      return api.approvePayout(
        payout.id,
        reason.trim() ? { note: reason.trim() } : {},
        options,
      );
    },
    onSuccess: (_, { payout, action }) => {
      delete keys.current[`${payout.id}:${action}`];
      setSuccess(
        action === "veto"
          ? "Payout vetoed. Its quest is closed and reserved funds have been released."
          : "Payment action accepted. The latest payout status appears below.",
      );
      setSelection(undefined);
      setReason("");
      for (const key of ["payouts", "bounties", "bounty", "river"])
        void cache.invalidateQueries({ queryKey: [key] });
    },
  });
  const choose = (payout: Payout, action: Action) => {
    setSelection({ payout, action });
    setReason("");
    setSuccess("");
    mutation.reset();
  };
  return (
    <>
      <PageHeading
        chapter="Council"
        title="Council workspace"
        description="Review payments awaiting approval and help verified work move past payment failures."
      />
      <Notice>
        Signed in as a council member. Permission is checked by the backend on
        each action.
        {api.mode === "fixture" &&
          " These controls operate on simulated demo payments only."}
      </Notice>
      {success && <Notice success>{success}</Notice>}
      {mutation.error && (
        <p className="inline-error" role="alert">
          {mutation.error.message}
        </p>
      )}
      {selection && (
        <Panel className="council-confirm">
          <PanelTitle>
            {selection.action === "veto"
              ? "Explain why this payout should stop."
              : selection.action === "retry"
                ? "Retry this verified cleanup payment?"
                : "Approve this cleanup reward?"}
          </PanelTitle>
          <p className="form-intro">
            {money(selection.payout.amount_cents)} USD ·{" "}
            {selection.payout.receiver_masked} ·{" "}
            {api.mode === "fixture" ? "Simulated payment" : "PayPal sandbox"}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate(selection);
            }}
          >
            <div className="form-field">
              <label htmlFor="council-reason">
                {selection.action === "veto"
                  ? "Veto reason (required)"
                  : "Review note (optional)"}
              </label>
              <textarea
                id="council-reason"
                ref={reasonRef}
                className="field"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                required={selection.action === "veto"}
                disabled={mutation.isPending}
              />
            </div>
            <div className="form-actions">
              <Button
                type="submit"
                variant={
                  selection.action === "veto" ? "destructive" : "default"
                }
                disabled={
                  mutation.isPending ||
                  (selection.action === "veto" && !reason.trim())
                }
              >
                {mutation.isPending
                  ? "Submitting decision…"
                  : selection.action === "veto"
                    ? "Confirm veto"
                    : selection.action === "retry"
                      ? "Confirm payment retry"
                      : "Confirm payout approval"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setSelection(undefined)}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Panel>
      )}
      <AsyncView query={query}>
        {({ items }) => (
          <div className="council-columns">
            {(["PENDING_APPROVAL", "FAILED"] as const).map((status) => {
              const payouts = items.filter((p) => p.status === status);
              return (
                <Panel key={status}>
                  <PanelTitle aside={<StatusBadge status={status} />}>
                    {status === "FAILED"
                      ? "A payment needs another try."
                      : "Awaiting your review."}
                  </PanelTitle>
                  {payouts.length ? (
                    <div className="council-payouts">
                      {payouts.map((p) => (
                        <article key={p.id}>
                          <div className="council-payout-head">
                            <strong className="numeric">
                              {money(p.amount_cents)}
                              <small>USD</small>
                            </strong>
                            <StatusBadge status={p.status} />
                          </div>
                          <p>{p.receiver_masked}</p>
                          <Link
                            className="text-link"
                            href={`/bounties/${p.bounty_id}`}
                          >
                            Review evidence & quest ↗
                          </Link>
                          {p.paypal_batch_id && (
                            <p className="payout-code">
                              <code>{p.paypal_batch_id}</code>
                            </p>
                          )}
                          <div className="form-actions">
                            {status === "FAILED" ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={mutation.isPending}
                                onClick={() => choose(p, "retry")}
                              >
                                <RefreshCw size={14} />
                                Retry payment
                              </Button>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  disabled={mutation.isPending}
                                  onClick={() => choose(p, "approve")}
                                >
                                  <Check size={14} />
                                  Review approval
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  disabled={mutation.isPending}
                                  onClick={() => choose(p, "veto")}
                                >
                                  <X size={14} />
                                  Veto
                                </Button>
                              </>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      title={
                        status === "FAILED"
                          ? "No failed payments to review."
                          : "Nothing waiting for approval."
                      }
                    >
                      New payment decisions will appear here automatically.
                    </EmptyState>
                  )}
                </Panel>
              );
            })}
          </div>
        )}
      </AsyncView>
      <div className="observatory-bottom">
        <ShieldCheck size={17} />
        <p>
          Council controls never override failed evidence checks. The backend
          authorizes actions and protects against duplicate payouts.
        </p>
      </div>
    </>
  );
}
