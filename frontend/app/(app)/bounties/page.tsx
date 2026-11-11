"use client";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import {
  ArrowUpRight,
  Camera,
  MapPin,
  Search,
  ShieldCheck,
  TimerOff,
} from "lucide-react";
import { useBounties } from "@/lib/queries";
import { money, statusLabels } from "@/lib/format";
import { readClaim, subscribeClaims } from "@/lib/claims";
import { api } from "@/lib/api";
import {
  AsyncView,
  Badge,
  EmptyState,
  PageHeading,
  StatusBadge,
} from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
import { AbstractArt } from "@/components/abstract-art";
export default function QuestsPage() {
  const query = useBounties();
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("OPEN"),
    [mine, setMine] = useState(false);
  const claimIds = useSyncExternalStore(
    subscribeClaims,
    () =>
      (query.data?.items ?? [])
        .filter((b) => readClaim(b.id))
        .map((b) => b.id)
        .join(","),
    () => "",
  );
  return (
    <>
      <PageHeading
        chapter="Quests"
        title="Cleanup quests"
        description="Open cleanups and the ones you have claimed."
      />
      <div className="filter-bar">
        <div className="search-field">
          <Search size={16} />
          <label className="sr-only" htmlFor="quest-search">
            Search cleanup quests
          </label>
          <input
            id="quest-search"
            className="field"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a cleanup quest…"
            type="search"
          />
        </div>
        <label className="sr-only" htmlFor="quest-status">
          Filter by status
        </label>
        <select
          id="quest-status"
          className="filter-select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="ALL">All quests</option>
          {[
            "OPEN",
            "CLAIMED",
            "PROOF_SUBMITTED",
            "VERIFIED",
            "PAYOUT_PENDING_APPROVAL",
            "PAID",
            "REJECTED",
            "PAYOUT_FAILED",
          ].map((s) => (
            <option key={s} value={s}>
              {statusLabels[s]}
            </option>
          ))}
        </select>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={mine}
            onChange={(e) => setMine(e.target.checked)}
          />
          My session claims
        </label>
      </div>
      <AsyncView query={query}>
        {({ items }) => {
          const visible = items.filter(
            (b) =>
              (status === "ALL" || b.status === status) &&
              `${b.title} ${b.description}`
                .toLowerCase()
                .includes(search.toLowerCase()) &&
              (!mine || claimIds.split(",").includes(b.id)),
          );
          return (
            <>
              <div className="results-caption">
                <span>
                  {visible.length} {visible.length === 1 ? "quest" : "quests"}{" "}
                  in this view
                </span>
                <span>
                  {api.mode === "fixture"
                    ? "Simulated demo scenarios"
                    : "Available API results"}{" "}
                  · All rewards in USD
                </span>
              </div>
              {visible.length ? (
                <div className="quest-grid">
                  {visible.map((b, index) => (
                    <article className="quest-card" key={b.id}>
                      <div className="quest-card-art">
                        <AbstractArt
                          variant={
                            (["river", "bloom", "ripple"] as const)[index % 3]
                          }
                        />
                      </div>
                      <div className="quest-card-header">
                        <StatusBadge status={b.status} />
                        <Badge>
                          {b.urgency === "med"
                            ? "Medium"
                            : b.urgency === "high"
                              ? "High"
                              : "Low"}{" "}
                          urgency
                        </Badge>
                      </div>
                      <div className="quest-card-body">
                        <h2>
                          <Link href={`/bounties/${b.id}`}>{b.title}</Link>
                        </h2>
                        <p>{b.description}</p>
                        <div className="quest-meta">
                          <span>
                            <MapPin size={13} />
                            {b.radius_m} m area
                          </span>
                          <span>
                            <TimerOff size={13} />
                            {b.expires_at ? "See posted expiry" : "No expiry"}
                          </span>
                          <span>
                            <Camera size={13} />
                            Photo proof
                          </span>
                        </div>
                        <div className="quest-reward">
                          <div>
                            <span className="tiny-label">Reward · USD</span>
                            <strong className="numeric">
                              {money(b.amount_cents)}
                              <small>
                                {api.mode === "fixture"
                                  ? "simulated"
                                  : "sandbox"}{" "}
                                payout
                              </small>
                            </strong>
                          </div>
                          <Button
                            asChild
                            variant={
                              b.status === "OPEN" ? "default" : "secondary"
                            }
                          >
                            <Link href={`/bounties/${b.id}`}>
                              {b.status === "OPEN"
                                ? "Open quest"
                                : readClaim(b.id) && b.status === "CLAIMED"
                                  ? "Continue quest"
                                  : "View quest"}
                              <ArrowUpRight size={15} />
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState title="No matching quests.">
                  <span>
                    Try another status or search. Session claims appear only in
                    the browser tab where you claimed them.
                  </span>
                  <Button
                    className="mt-5"
                    variant="secondary"
                    onClick={() => {
                      setSearch("");
                      setStatus("ALL");
                      setMine(false);
                    }}
                  >
                    Clear filters
                  </Button>
                </EmptyState>
              )}
            </>
          );
        }}
      </AsyncView>
      <div className="observatory-bottom">
        <ShieldCheck size={17} />
        <p>
          Payment follows verification and any required council approval. Claims
          do not expire.
        </p>
      </div>
    </>
  );
}
