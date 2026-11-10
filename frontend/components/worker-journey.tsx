"use client";
import Image from "next/image";
import {
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import {
  Camera,
  Check,
  Copy,
  KeyRound,
  LocateFixed,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import type { Bounty } from "@/lib/contracts";
import { api, ApiError } from "@/lib/api";
import { readClaim, saveClaim, subscribeClaims } from "@/lib/claims";
import { browserLocation, preparePhoto, type CapturedPhoto } from "@/lib/photo";
import { dateTime, money } from "@/lib/format";
import { Button } from "./ui/button";
import { Notice, Panel, PanelTitle, StatusBadge } from "./ui/shared";
import { VerificationCard } from "./verification-card";
export function WorkerJourney({
  bounty: b,
  query,
}: {
  bounty: Bounty;
  query: UseQueryResult<Bounty, Error>;
}) {
  const cache = useQueryClient();
  const storedToken = useSyncExternalStore(
    subscribeClaims,
    () => readClaim(b.id),
    () => "",
  );
  const [localToken, setLocalToken] = useState(""),
    [workerName, setWorkerName] = useState(""),
    [email, setEmail] = useState(""),
    [recovery, setRecovery] = useState(""),
    [message, setMessage] = useState(""),
    [showToken, setShowToken] = useState(false);
  const [before, setBefore] = useState<CapturedPhoto>(),
    [after, setAfter] = useState<CapturedPhoto>(),
    [processing, setProcessing] = useState<"before" | "after">(),
    [photoError, setPhotoError] = useState(""),
    [demoLocation, setDemoLocation] = useState(false);
  const token = localToken || storedToken;
  const refresh = () => {
    for (const key of ["bounties", "river", "payouts", "diary"])
      void cache.invalidateQueries({ queryKey: [key] });
  };
  const claim = useMutation({
    mutationFn: () =>
      api.claimBounty(b.id, {
        worker_name: workerName.trim(),
        paypal_email: email.trim(),
      }),
    onSuccess: (result) => {
      setLocalToken(result.claim_token);
      const saved = saveClaim(b.id, result.claim_token);
      setMessage(
        saved
          ? "Quest claimed. Your token is saved for this browser session. Save a recovery copy before closing the tab."
          : "Quest claimed, but browser storage is unavailable. Save your recovery token now to avoid losing access.",
      );
      cache.setQueryData(["bounty", b.id], result.bounty);
      setEmail("");
      refresh();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "INVALID_STATE")
        void query.refetch();
    },
  });
  const proof = useMutation({
    mutationFn: () => {
      if (!before || !after) throw new Error("Capture both photos first.");
      return api.submitProof(
        b.id,
        {
          before: before.file,
          after: after.file,
          lat: after.lat,
          lon: after.lon,
          before_captured_at: before.capturedAt,
          after_captured_at: after.capturedAt,
        },
        token,
      );
    },
    onSuccess: (result) => {
      cache.setQueryData(["bounty", b.id], result.bounty);
      refresh();
    },
    onError: (error) => {
      if (
        error instanceof ApiError &&
        ["INVALID_STATE", "INTERNAL"].includes(error.code)
      )
        void query.refetch();
    },
  });
  async function capture(
    kind: "before" | "after",
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoError("");
    setProcessing(kind);
    const capturedAt = new Date().toISOString();
    try {
      if (
        !["image/jpeg", "image/png"].includes(file.type) ||
        file.size > 8 * 1024 * 1024
      )
        throw new Error("Choose a JPEG or PNG up to 8 MB.");
      const location =
        api.mode === "fixture" && demoLocation
          ? { lat: b.lat, lon: b.lon }
          : await browserLocation();
      const photo = await preparePhoto(file, location, capturedAt);
      if (Date.parse(photo.capturedAt) < Date.parse(b.claimed_at ?? ""))
        throw new Error(
          `Take or choose a fresh ${kind} photo after claiming this quest.`,
        );
      if (
        kind === "after" &&
        before &&
        Date.parse(photo.capturedAt) <= Date.parse(before.capturedAt)
      )
        throw new Error("Capture the after photo after the before photo.");
      if (kind === "before") {
        setBefore(photo);
        setAfter(undefined);
      } else setAfter(photo);
    } catch (error) {
      setPhotoError(
        error instanceof Error ? error.message : "Could not prepare the photo.",
      );
    } finally {
      setProcessing(undefined);
      event.target.value = "";
    }
  }
  const step =
    b.status === "OPEN"
      ? 0
      : b.status === "CLAIMED"
        ? 1
        : ["PROOF_SUBMITTED", "REJECTED"].includes(b.status)
          ? 2
          : b.status === "PAID"
            ? 4
            : 3;
  return (
    <div className="worker-journey">
      <ol className="quest-stepper" aria-label="Cleanup progress">
        {[
          "Claim your quest",
          "Capture the change",
          "Verify the work",
          "Follow the payout",
        ].map((label, i) => (
          <li
            key={label}
            className={
              i < step ? "step-complete" : i === step ? "step-current" : ""
            }
            aria-current={i === step ? "step" : undefined}
          >
            <span>{i < step ? <Check size={14} /> : `0${i + 1}`}</span>
            <strong>{label}</strong>
          </li>
        ))}
      </ol>
      {message && <Notice success>{message}</Notice>}
      {b.status === "OPEN" && (
        <Panel>
          <PanelTitle aside={<KeyRound size={18} className="text-primary" />}>
            Make this stretch your next chapter.
          </PanelTitle>
          <p className="form-intro">
            Claim this cleanup with your name and a PayPal{" "}
            <strong>sandbox personal-account</strong> email. No account or
            password is needed.
          </p>
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              claim.mutate();
            }}
            className="claim-form"
          >
            <div className="form-field">
              <label htmlFor="worker-name">Your name</label>
              <input
                id="worker-name"
                className="field"
                value={workerName}
                onChange={(e) => setWorkerName(e.target.value)}
                maxLength={60}
                autoComplete="name"
                required
                placeholder="How should we call you?"
                disabled={claim.isPending}
              />
            </div>
            <div className="form-field">
              <label htmlFor="paypal-email">
                PayPal sandbox personal email
              </label>
              <input
                id="paypal-email"
                className="field"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                maxLength={254}
                required
                placeholder="Your sandbox personal account"
                disabled={claim.isPending}
              />
              <small>
                Use a sandbox personal account from PayPal Developer. This
                prototype does not pay real money.
              </small>
            </div>
            {claim.error && (
              <p role="alert" className="inline-error">
                {claim.error.message}
              </p>
            )}
            <Button
              type="submit"
              disabled={claim.isPending || !workerName.trim() || !email.trim()}
            >
              {claim.isPending ? "Claiming your quest…" : "Claim this cleanup"}
              <ShieldCheck size={16} />
            </Button>
          </form>
        </Panel>
      )}
      {b.status === "CLAIMED" && !token && (
        <Panel>
          <PanelTitle>Pick up where you left off.</PanelTitle>
          <p className="form-intro">
            This quest belongs to {b.worker_name ?? "its worker"}. Restore its
            claim token to submit evidence. Name and email cannot recover a lost
            token.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const restored = recovery.trim();
              setLocalToken(restored);
              const saved = saveClaim(b.id, restored);
              setMessage(
                saved
                  ? "Claim token restored for this browser session."
                  : "Token restored, but browser storage is unavailable. Save your recovery token to avoid losing access.",
              );
              setRecovery("");
            }}
            className="form-stack"
          >
            <div className="form-field">
              <label htmlFor="restore-token">Claim recovery token</label>
              <input
                id="restore-token"
                type="password"
                autoComplete="off"
                className="field"
                value={recovery}
                onChange={(e) => setRecovery(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={!recovery.trim()}>
              Restore this claim
              <KeyRound size={16} />
            </Button>
          </form>
        </Panel>
      )}
      {b.status === "CLAIMED" && token && (
        <>
          <details className="recovery-token">
            <summary>
              <KeyRound size={14} />
              Save a recovery token
            </summary>
            <p>
              Your token gives access to this quest. Keep it private. This tab
              remembers it for the current browser session.
            </p>
            <div>
              <input
                aria-label="Claim recovery token"
                type={showToken ? "text" : "password"}
                readOnly
                value={token}
                className="field"
                autoComplete="off"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? "Hide" : "Show"}
              </Button>
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(token);
                    setMessage("Recovery token copied. Keep it private.");
                  } catch {
                    setMessage(
                      "Clipboard unavailable. Reveal and copy the recovery token manually.",
                    );
                  }
                }}
                aria-label="Copy recovery token"
              >
                <Copy size={15} />
              </Button>
            </div>
          </details>
          <Panel>
            <PanelTitle aside={<Camera size={18} className="text-primary" />}>
              Capture a change worth seeing.
            </PanelTitle>
            <p className="form-intro">
              Photograph the same stretch before and after cleaning. Keep the
              framing similar. The browser records the selection time and
              requests a fresh location for each photo.
            </p>
            {api.mode === "fixture" && (
              <label className="checkbox-label demo-location">
                <input
                  type="checkbox"
                  checked={demoLocation}
                  onChange={(e) => {
                    setDemoLocation(e.target.checked);
                    setBefore(undefined);
                    setAfter(undefined);
                  }}
                  disabled={!!processing || proof.isPending}
                />
                Use simulated quest location for this demo only
              </label>
            )}
            {demoLocation && api.mode === "fixture" && (
              <Notice>
                Location is simulated at the quest coordinates. Verification
                will use predefined mock checks, not real AI.
              </Notice>
            )}
            <div className="photo-pair">
              {(["before", "after"] as const).map((kind) => {
                const photo = kind === "before" ? before : after;
                const disabled =
                  !!processing ||
                  proof.isPending ||
                  (kind === "after" && !before);
                return (
                  <div className="photo-field" key={kind}>
                    <div className="photo-label">
                      <span>0{kind === "before" ? "1" : "2"}</span>
                      <h3>
                        {kind === "before"
                          ? "Before the cleanup"
                          : "After the cleanup"}
                      </h3>
                    </div>
                    <label
                      className={`photo-input ${disabled ? "photo-disabled" : ""}`}
                    >
                      <input
                        aria-label={
                          kind === "before"
                            ? "Before cleanup photo"
                            : "After cleanup photo"
                        }
                        className="sr-only"
                        type="file"
                        accept="image/jpeg,image/png"
                        capture="environment"
                        onChange={(event) => void capture(kind, event)}
                        disabled={disabled}
                      />
                      {photo ? (
                        <Image
                          src={photo.preview}
                          alt={`${kind === "before" ? "Before" : "After"} cleanup evidence preview`}
                          fill
                          unoptimized
                          sizes="(max-width: 540px) 85vw, 40vw"
                        />
                      ) : (
                        <>
                          <Camera size={28} strokeWidth={1.2} />
                          <strong>
                            {processing === kind
                              ? "Preparing your photo…"
                              : kind === "after" && !before
                                ? "Capture the before photo first"
                                : "Take or choose a photo"}
                          </strong>
                          <span>JPEG / PNG · Up to 8 MB</span>
                        </>
                      )}
                    </label>
                    {photo && (
                      <p className="capture-details">
                        <Check size={12} />
                        {dateTime(photo.capturedAt)}
                        <br />
                        {demoLocation
                          ? "Simulated location"
                          : "Browser location"}
                        : {photo.lat.toFixed(5)}, {photo.lon.toFixed(5)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {photoError && (
              <p className="inline-error" role="alert">
                {photoError}
              </p>
            )}
            {proof.error && (
              <p className="inline-error" role="alert">
                {proof.error.message} Your photos have been kept.
              </p>
            )}
            <div className="proof-submit">
              <div>
                <LocateFixed size={16} />
                <p>
                  Time and location are recorded at selection.
                  <br />
                  Keep this tab open; photos are not saved between pages.
                </p>
              </div>
              <Button
                disabled={!before || !after || !!processing || proof.isPending}
                onClick={() => proof.mutate()}
              >
                {proof.isPending
                  ? "Checking your evidence…"
                  : "Submit cleanup proof"}
                <ShieldCheck size={16} />
              </Button>
            </div>
            <p className="proof-progress" aria-live="polite">
              {proof.isPending
                ? "Checking the photos… usually under 20 seconds. A slow connection or cold start can take longer."
                : "The backend checks the evidence before any payout can proceed."}
            </p>
          </Panel>
        </>
      )}
      {b.verification && <VerificationCard verification={b.verification} />}
      {b.status !== "OPEN" && b.status !== "CLAIMED" && (
        <Panel>
          <PanelTitle aside={<StatusBadge status={b.status} />}>
            The next part of the journey.
          </PanelTitle>
          <div aria-live="polite" className="payment-result">
            <strong className="numeric">
              {money(b.amount_cents)} <span>USD</span>
            </strong>
            <p>
              {b.status === "PAID"
                ? "The payout is confirmed. Thank you for carrying a little of the river’s work."
                : b.status === "REJECTED"
                  ? `This quest is closed. ${b.rejection_reason ?? "The evidence did not satisfy the verification policy."}`
                  : b.status === "PAYOUT_PENDING_APPROVAL"
                    ? "The cleanup passed verification. A council member must review the payout before it can be sent."
                    : b.status === "PAYOUT_FAILED"
                      ? "Verification passed, but the payment failed. The council can review and retry it. Do not submit the cleanup again."
                      : "Your cleanup is moving through verification and payment. This view refreshes automatically."}
            </p>
            {b.payout && (
              <div className="payout-reference">
                <span>Recipient: {b.payout.receiver_masked}</span>
                <span>Payout status: {b.payout.status}</span>
                <code>
                  {b.payout.paypal_batch_id ??
                    "No PayPal batch has been sent yet"}
                </code>
              </div>
            )}
            <Button
              variant="secondary"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              <RefreshCw size={14} />
              Refresh quest status
            </Button>
          </div>
        </Panel>
      )}
    </div>
  );
}
