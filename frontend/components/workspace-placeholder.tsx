"use client";
import { usePathname } from "next/navigation";
export function PlaceholderCard({ className = "" }: { className?: string }) {
  return (
    <div className={`placeholder-card ${className}`} aria-hidden="true">
      <i />
      <b />
      <b />
      <b />
    </div>
  );
}
export function OverviewMetricPlaceholder() {
  return (
    <div
      className="overview-stats"
      role="status"
      aria-label="Loading overview metrics"
    >
      {Array.from({ length: 6 }, (_, i) => (
        <PlaceholderCard className="metric-card" key={i} />
      ))}
    </div>
  );
}
export function WorkspacePlaceholder() {
  const path = usePathname();
  const overview = path === "/river";
  const atlas = path.startsWith("/atlas");
  const about = path.startsWith("/about");
  const reports = path.startsWith("/reports");
  const quests = path === "/bounties";
  const donate = path === "/donate";
  return (
    <div
      className={`workspace-placeholder placeholder-${overview ? "overview" : atlas ? "atlas" : about ? "about" : reports ? "report" : quests ? "quests" : "form"}`}
      role="status"
      aria-label="Loading page sections"
    >
      <span className="sr-only">Loading page sections…</span>
      <div className="placeholder-heading" aria-hidden="true">
        <div className="placeholder-title" />
        <div className="placeholder-subtitle" />
      </div>
      {overview ? (
        <>
          <OverviewMetricPlaceholder />
          <div className="overview-charts">
            {[0, 1, 2].map((i) => (
              <PlaceholderCard className="placeholder-chart" key={i} />
            ))}
          </div>
          <div className="overview-lists">
            {[0, 1, 2].map((i) => (
              <PlaceholderCard key={i} />
            ))}
          </div>
        </>
      ) : atlas ? (
        <>
          <div className="placeholder-filter" />
          <PlaceholderCard className="placeholder-map" />
          <div className="placeholder-pair">
            <PlaceholderCard />
            <PlaceholderCard />
          </div>
        </>
      ) : quests ? (
        <>
          <div className="placeholder-filter" />
          <div className="quest-grid">
            {Array.from({ length: 6 }, (_, i) => (
              <PlaceholderCard className="placeholder-quest" key={i} />
            ))}
          </div>
        </>
      ) : about ? (
        <div className="placeholder-about-layout">
          <div className="phone-workflow phone-workflow-compact">
            {[0, 1, 2].map((i) => (
              <PlaceholderCard className="placeholder-phone" key={i} />
            ))}
          </div>
          <div>
            {[0, 1, 2].map((i) => (
              <PlaceholderCard key={i} />
            ))}
          </div>
        </div>
      ) : donate ? (
        <DonationPagePlaceholder />
      ) : reports ? (
        <>
          <div className="placeholder-filter" />
          <PlaceholderCard className="placeholder-cover" />
          <div className="placeholder-four">
            {[0, 1, 2, 3].map((i) => (
              <PlaceholderCard key={i} />
            ))}
          </div>
          <PlaceholderCard className="placeholder-chart" />
          <div className="placeholder-pair">
            <PlaceholderCard />
            <PlaceholderCard />
          </div>
        </>
      ) : (
        <>
          <div className="placeholder-four">
            {[0, 1, 2, 3].map((i) => (
              <PlaceholderCard key={i} />
            ))}
          </div>
          <div className="placeholder-pair">
            <PlaceholderCard className="placeholder-cover" />
            <PlaceholderCard className="placeholder-cover" />
          </div>
        </>
      )}
    </div>
  );
}
export function TreasuryMetricPlaceholder() {
  return (
    <div
      className="metric-grid"
      role="status"
      aria-label="Loading treasury totals"
    >
      {[0, 1, 2, 3].map((i) => (
        <div
          className="metric-card placeholder-metric"
          key={i}
          aria-hidden="true"
        >
          <i />
          <b />
          <em />
        </div>
      ))}
    </div>
  );
}
export function LedgerPlaceholder() {
  return (
    <div
      className="placeholder-ledger"
      role="status"
      aria-label="Loading payout rows"
    >
      <div className="placeholder-ledger-head" />
      {[0, 1, 2].map((i) => (
        <div className="placeholder-ledger-row" aria-hidden="true" key={i}>
          {[0, 1, 2, 3, 4].map((j) => (
            <span key={j} />
          ))}
        </div>
      ))}
    </div>
  );
}
export function DonationPagePlaceholder() {
  return (
    <>
      <TreasuryMetricPlaceholder />
      <div
        className="donate-layout placeholder-donation-layout"
        aria-hidden="true"
      >
        <div className="panel placeholder-donation-form">
          <div className="placeholder-form-title" />
          <div className="placeholder-form-copy" />
          <div className="placeholder-label" />
          <div className="placeholder-presets">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} />
            ))}
          </div>
          <div className="placeholder-label" />
          <div className="placeholder-input" />
          <div className="placeholder-help" />
          <div className="placeholder-label" />
          <div className="placeholder-input" />
          <div className="placeholder-help" />
          <div className="placeholder-form-notice" />
          <div className="placeholder-input placeholder-submit" />
          <div className="placeholder-form-caption" />
        </div>
        <div className="treasury-story placeholder-treasury-story">
          <div className="placeholder-story-icon" />
          <div className="placeholder-story-title" />
          <div className="placeholder-story-copy" />
          {[0, 1, 2].map((i) => (
            <div className="placeholder-story-step" key={i}>
              <span />
              <div>
                <i />
                <b />
              </div>
            </div>
          ))}
          <div className="placeholder-story-copy" />
        </div>
      </div>
      <PlaceholderCard className="placeholder-contributions" />
      <LedgerPlaceholder />
    </>
  );
}
export function ReportBodyPlaceholder() {
  return (
    <div
      className="workspace-placeholder"
      role="status"
      aria-label="Loading monthly report"
    >
      <PlaceholderCard className="placeholder-cover" />
      <div className="placeholder-four">
        {[0, 1, 2, 3].map((i) => (
          <PlaceholderCard key={i} />
        ))}
      </div>
      <PlaceholderCard className="placeholder-chart" />
      <div className="placeholder-pair">
        <PlaceholderCard />
        <PlaceholderCard />
      </div>
    </div>
  );
}
