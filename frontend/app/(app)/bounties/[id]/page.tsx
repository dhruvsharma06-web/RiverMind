"use client";
import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MapPin, ShieldCheck, TimerOff } from "lucide-react";
import { api } from "@/lib/api";
import { dateTime, money } from "@/lib/format";
import {
  AsyncView,
  Badge,
  PageHeading,
  Panel,
  PanelTitle,
  StatusBadge,
} from "@/components/ui/shared";
import { WorkerJourney } from "@/components/worker-journey";
export default function BountyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const query = useQuery({
    queryKey: ["bounty", id],
    queryFn: ({ signal }) => api.getBounty(id, { signal }),
    refetchInterval: 5_000,
    retry: false,
  });
  return (
    <>
      <Link className="back-link" href="/bounties">
        <ArrowLeft size={14} />
        Back to quests
      </Link>
      <AsyncView query={query}>
        {(b) => (
          <>
            <PageHeading
              chapter="Quest"
              title={b.title}
              description={b.description}
              action={<StatusBadge status={b.status} />}
            />
            <div className="bounty-details-grid">
              <div className="bounty-main">
                <WorkerJourney key={b.id} bounty={b} query={query} />
              </div>
              <aside className="bounty-aside">
                <Panel>
                  <span className="tiny-label">YOUR CLEANUP REWARD</span>
                  <div className="bounty-amount numeric">
                    {money(b.amount_cents)}
                    <span>USD</span>
                  </div>
                  <Badge>
                    {api.mode === "fixture"
                      ? "Simulated payout"
                      : "PayPal sandbox"}
                  </Badge>
                  <div className="bounty-facts">
                    <p>
                      <MapPin size={15} />
                      <span>
                        Cleanup area<strong>{b.radius_m} m radius</strong>
                      </span>
                    </p>
                    <p>
                      <TimerOff size={15} />
                      <span>
                        Quest expiry
                        <strong>
                          {b.expires_at ? dateTime(b.expires_at) : "No expiry"}
                        </strong>
                      </span>
                    </p>
                    <p>
                      <ShieldCheck size={15} />
                      <span>
                        Verification<strong>Before & after evidence</strong>
                      </span>
                    </p>
                  </div>
                  <p className="coordinate-line">
                    {b.lat.toFixed(5)}° N<br />
                    {b.lon.toFixed(5)}° E
                  </p>
                  <Link className="text-link" href="/atlas">
                    Find it in the atlas ↗
                  </Link>
                </Panel>
                <Panel>
                  <PanelTitle>Why this quest?</PanelTitle>
                  <p className="agent-rationale">{b.agent_rationale}</p>
                  <p className="chart-source">
                    Agent proposal · Backend budget rules decide the final
                    amount.
                  </p>
                </Panel>
                <div className="worker-safety">
                  <ShieldCheck size={18} />
                  <p>
                    Stay on accessible riverbanks. Avoid entering the water,
                    handling hazardous materials, or taking personal risks to
                    complete a quest.
                  </p>
                </div>
              </aside>
            </div>
          </>
        )}
      </AsyncView>
    </>
  );
}
