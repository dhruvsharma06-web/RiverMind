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
              <span>EVERY GOOD STORY STARTS SOMEWHERE.</span>
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
                    Explore this quest
                    <ArrowUpRight size={16} />
                  </Link>
                </Button>
              </div>
            </div>
          </article>
        ) : (
          <EmptyState
            title="Every open quest has found a guardian."
            href="/bounties"
            action="Explore the quest journal"
          >
            New cleanup opportunities will appear here when they become
            available.
          </EmptyState>
        );
      }}
    </AsyncView>
  );
}
