"use client";

import Link from "next/link";
import { ArrowUpRight, Camera, MapPin } from "lucide-react";
import { useBounties } from "@/lib/queries";
import { money } from "@/lib/format";
import { api } from "@/lib/api";
import { AbstractArt } from "./abstract-art";
import { AsyncView, EmptyState, StatusBadge } from "./ui/shared";
import { Button } from "./ui/button";

export function LandingQuest() {
  const bounties = useBounties();
  return (
    <AsyncView query={bounties}>
      {({ items }) => {
        const quest = items.find((bounty) => bounty.status === "OPEN");
        return quest ? (
          <article className="experience-quest-card">
            <div className="experience-quest-art">
              <AbstractArt variant="river" />
            </div>
            <div className="experience-quest-copy">
              <StatusBadge status={quest.status} />
              <h3>{quest.title}</h3>
              <p>{quest.description}</p>
              <div className="experience-quest-meta">
                <span>
                  <MapPin size={14} />
                  {quest.radius_m} m cleanup area
                </span>
                <span>
                  <Camera size={14} />
                  Before & after proof
                </span>
              </div>
              <div className="experience-quest-reward">
                <div>
                  <small>Cleanup reward · USD</small>
                  <strong>{money(quest.amount_cents)}</strong>
                  <span>
                    {api.mode === "fixture"
                      ? "Simulated demo reward"
                      : "PayPal sandbox reward"}
                  </span>
                </div>
                <Button asChild>
                  <Link href={`/bounties/${quest.id}`}>
                    See this quest
                    <ArrowUpRight size={16} />
                  </Link>
                </Button>
              </div>
            </div>
          </article>
        ) : (
          <EmptyState
            title="No open quests right now."
            href="/bounties"
            action="Explore quests"
          >
            New quests appear here when they open.
          </EmptyState>
        );
      }}
    </AsyncView>
  );
}
