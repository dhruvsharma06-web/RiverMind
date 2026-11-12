"use client";
import { Heart, ShieldCheck, Wallet } from "lucide-react";
import { useDonations, useRiver } from "@/lib/queries";
import { dateTime, money } from "@/lib/format";
import { DonationForm } from "@/components/donation-form";
import { PayoutLedger } from "@/components/payout-ledger";
import { TreasuryMetricPlaceholder } from "@/components/workspace-placeholder";
import {
  AsyncView,
  Badge,
  EmptyState,
  PageHeading,
  Panel,
  PanelTitle,
} from "@/components/ui/shared";
export default function TreasuryPage() {
  const river = useRiver(),
    donations = useDonations();
  return (
    <>
      <PageHeading
        chapter="Treasury"
        title="River treasury"
        description="Fund cleanups and follow each contribution to a verified payout."
        action={
          <Badge tone="gold">
            <Wallet size={13} />
            USD · Sandbox prototype
          </Badge>
        }
      />
      <AsyncView query={river} loading={<TreasuryMetricPlaceholder />}>
        {(r) => (
          <div className="metric-grid">
            {[
              ["Available", r.treasury.available_cents],
              ["Reserved for quests", r.treasury.reserved_cents],
              ["Paid out", r.treasury.paid_cents],
              ["Donations", r.treasury.donated_cents],
            ].map(([label, value]) => (
              <div className="metric-card" key={label}>
                <span>{label}</span>
                <strong className="numeric">{money(Number(value))}</strong>
                <p>INR estimate</p>
              </div>
            ))}
          </div>
        )}
      </AsyncView>
      <div className="donate-layout">
        <DonationForm />
        <div className="treasury-story">
          <span className="treasury-story-symbol">
            <Heart size={32} strokeWidth={1} />
          </span>
          <h2>Where your money goes</h2>
          <p>
            Every contribution enters one shared treasury. Backend rules cap
            rewards and reserve the funds before a quest is posted.
          </p>
          <ol>
            <li>
              <span>01</span>
              <div>
                <strong>Donate</strong>
                <p>A captured contribution adds to available funds.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Reserve</strong>
                <p>Each posted quest reserves its reward.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Pay</strong>
                <p>
                  Evidence is checked, then the payout follows the approval
                  policy.
                </p>
              </div>
            </li>
          </ol>
          <div className="small-trust-note">
            <ShieldCheck size={20} />
            <p>
              Contributions do not guarantee a particular environmental outcome.
            </p>
          </div>
        </div>
      </div>
      <Panel className="contributions-panel">
        <PanelTitle>Contributions</PanelTitle>
        <AsyncView query={donations}>
          {({ items }) =>
            items.length ? (
              <div className="contribution-list">
                {items.map((d) => (
                  <article key={d.id}>
                    <span className="contributor-icon">
                      <Heart size={16} />
                    </span>
                    <div>
                      <h3>{d.donor_name ?? "Anonymous"}</h3>
                      <p>{dateTime(d.created_at)}</p>
                    </div>
                    <strong className="numeric">
                      {money(d.amount_cents)}
                      <small>INR estimate</small>
                    </strong>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No donations yet.">
                Captured contributions appear here.
              </EmptyState>
            )
          }
        </AsyncView>
      </Panel>
      <Panel id="ledger">
        <PanelTitle>Payouts</PanelTitle>
        <PayoutLedger />
      </Panel>
    </>
  );
}
