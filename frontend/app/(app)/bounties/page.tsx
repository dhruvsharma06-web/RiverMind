"use client";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
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
import { SelectField } from "@/components/ui/select-field";
import { Pagination } from "@/components/ui/pagination";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { PlaceholderCard } from "@/components/workspace-placeholder";
import { AbstractArt } from "@/components/abstract-art";
export default function QuestsPage() {
  const query = useBounties();
  const [page, setPage] = useState(1);
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
  const settledSearch = useDebouncedValue(search);
  const visible = useMemo(
    () =>
      (query.data?.items ?? []).filter(
        (b) =>
          (status === "ALL" || b.status === status) &&
          `${b.title} ${b.description}`
            .toLowerCase()
            .includes(settledSearch.toLowerCase()) &&
          (!mine || claimIds.split(",").includes(b.id)),
      ),
    [query.data, status, settledSearch, mine, claimIds],
  );
  const pages = Math.max(1, Math.ceil(visible.length / 6));
  const currentPage = Math.min(page, pages);
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
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Find a cleanup quest…"
            type="search"
          />
        </div>
        <label className="sr-only" htmlFor="quest-status">
          Filter by status
        </label>
        <SelectField
          id="quest-status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
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
        </SelectField>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={mine}
            onChange={(e) => {
              setMine(e.target.checked);
              setPage(1);
            }}
          />
          My session claims
        </label>
      </div>
      <AsyncView
        query={query}
        loading={
          <div className="quest-grid" role="status" aria-label="Loading quests">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <PlaceholderCard className="placeholder-quest" key={i} />
            ))}
          </div>
        }
      >
        {() => {
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
                  · INR estimates · payouts in USD
                </span>
              </div>
              {visible.length ? (
                <div className="quest-grid">
                  {visible
                    .slice((currentPage - 1) * 6, currentPage * 6)
                    .map((b, index) => (
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
                              <span className="tiny-label">
                                Reward · INR estimate
                              </span>
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
                      setPage(1);
                    }}
                  >
                    Clear filters
                  </Button>
                </EmptyState>
              )}
              <Pagination
                label="Quest pages"
                page={currentPage}
                pages={pages}
                onChange={setPage}
              />
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
