"use client";
import { Heart, ShieldCheck, Wallet } from "lucide-react";
import { useDonations, useRiver } from "@/lib/queries";
import { dateTime, money } from "@/lib/format";
import { DonationForm } from "@/components/donation-form";
import { PayoutLedger } from "@/components/payout-ledger";
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
        description="Fund the next cleanup and follow every contribution through to a verified payout."
        action={
          <Badge tone="gold">
            <Wallet size={13} />
            USD · Sandbox prototype
          </Badge>
        }
      />
      <AsyncView query={river}>
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
                <p>USD · Shared river treasury</p>
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
          <h2>
            Care is stronger
            <br />
            when we can follow it.
          </h2>
          <p>
            Every contribution enters one shared treasury. Backend rules cap
            rewards and reserve the funds before a quest is posted.
          </p>
          <ol>
            <li>
              <span>01</span>
              <div>
                <strong>Fund the possibility.</strong>
                <p>A captured contribution increases available funds.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Back a clear task.</strong>
                <p>Posted quests reserve their reward from the treasury.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Reward verified work.</strong>
                <p>
                  Evidence is checked before payouts follow the approval policy.
                </p>
              </div>
            </li>
          </ol>
          <div className="small-trust-note">
            <ShieldCheck size={20} />
            <p>
              Contributions do not guarantee a particular environmental outcome.
              The ledger makes payment activity visible.
            </p>
          </div>
        </div>
      </div>
      <Panel className="contributions-panel">
        <PanelTitle>Those keeping the story flowing.</PanelTitle>
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
                      <h3>{d.donor_name ?? "An unnamed river supporter"}</h3>
                      <p>{dateTime(d.created_at)}</p>
                    </div>
                    <strong className="numeric">
                      {money(d.amount_cents)}
                      <small>USD</small>
                    </strong>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No donations yet.">
                Captured contributions will appear here.
              </EmptyState>
            )
          }
        </AsyncView>
      </Panel>
      <Panel id="ledger">
        <PanelTitle>Every payout leaves a trail.</PanelTitle>
        <PayoutLedger />
      </Panel>
    </>
  );
}
