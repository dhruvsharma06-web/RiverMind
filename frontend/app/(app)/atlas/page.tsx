"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Compass, MapPin } from "lucide-react";
import { api } from "@/lib/api";
import { useBounties } from "@/lib/queries";
import { dateTime, money, statusLabels } from "@/lib/format";
import type { AtlasPoint } from "@/components/river-map";
import {
  AsyncView,
  Badge,
  EmptyState,
  PageHeading,
  Panel,
  PanelTitle,
  Skeleton,
} from "@/components/ui/shared";
import { Button } from "@/components/ui/button";
const Map = dynamic(() => import("@/components/river-map"), {
  ssr: false,
  loading: () => (
    <div className="map-loading">
      <Skeleton lines={5} />
      <p>Unfolding the river atlas…</p>
    </div>
  ),
});
export default function AtlasPage() {
  const bounties = useBounties(),
    events = useQuery({
      queryKey: ["events"],
      queryFn: ({ signal }) => api.getEvents({}, { signal }),
      refetchInterval: 5_000,
    });
  const [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<string>();
  const onSelect = useCallback((id: string) => setSelected(id), []);
  const points = useMemo<AtlasPoint[]>(
    () =>
      [
        ...(bounties.data?.items ?? []).map((b) => ({
          id: `quest:${b.id}`,
          lat: b.lat,
          lon: b.lon,
          title: b.title,
          kind: "quest" as const,
          detail: `${statusLabels[b.status]} · ${money(b.amount_cents)} USD`,
          bountyId: b.id,
        })),
        ...(events.data?.items ?? []).map((e) => ({
          id: `event:${e.id}`,
          lat: e.lat,
          lon: e.lon,
          title: e.summary,
          kind: "event" as const,
          detail: `Severity ${e.severity}/5 · ${dateTime(e.created_at)}`,
          bountyId: e.bounty_id ?? undefined,
        })),
      ].filter((p) => filter === "all" || p.kind === filter),
    [bounties.data, events.data, filter],
  );
  const point = points.find((p) => p.id === selected);
  return (
    <>
      <PageHeading
        chapter="Chapter 02 / The river atlas"
        title="River atlas"
        description="Explore pollution signals and cleanup opportunities along the Yamuna’s Delhi reach."
        action={
          <Badge tone="aqua">
            <MapPin size={12} />
            Yamuna · Delhi
          </Badge>
        }
      />
      <div className="atlas-toolbar">
        <div className="segmented-control" aria-label="Map layers">
          {[
            ["all", "All locations"],
            ["quest", "Cleanup quests"],
            ["event", "Events"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={filter === value}
              onClick={() => {
                setFilter(value);
                setSelected(undefined);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="tiny-label">
          {points.length} LOCATIONS IN THIS VIEW
        </span>
      </div>
      <AsyncView query={bounties}>
        {() => <Map points={points} selected={selected} onSelect={onSelect} />}
      </AsyncView>
      <div className="atlas-detail-grid">
        <Panel>
          <PanelTitle>Field notes</PanelTitle>
          {point ? (
            <div className="atlas-selection">
              <Badge tone={point.kind === "quest" ? "gold" : "aqua"}>
                {point.kind === "quest" ? "Cleanup quest" : "Pollution event"}
              </Badge>
              <h2>{point.title}</h2>
              <p>{point.detail}</p>
              <p className="coordinate-line">
                {point.lat.toFixed(5)}° N, {point.lon.toFixed(5)}° E · WGS84
              </p>
              {point.bountyId && (
                <Button asChild>
                  <Link href={`/bounties/${point.bountyId}`}>
                    Open field journal
                    <ArrowUpRight size={15} />
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <EmptyState title="A place to begin.">
              <span>
                Select a marker or a location from the list to read its field
                notes. Locations come from event and bounty data; no monitoring
                station locations are inferred.
              </span>
            </EmptyState>
          )}
        </Panel>
        <Panel>
          <PanelTitle aside={<Compass size={17} className="text-primary" />}>
            Location journal
          </PanelTitle>
          <AsyncView query={events}>
            {() =>
              points.length ? (
                <div className="atlas-location-list">
                  {points.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelected(p.id)}
                      aria-pressed={selected === p.id}
                    >
                      <MapPin size={15} />
                      <span>
                        <strong>{p.title}</strong>
                        <small>
                          {p.kind === "quest" ? "Quest" : "Event"} ·{" "}
                          {p.lat.toFixed(4)}, {p.lon.toFixed(4)}
                        </small>
                      </span>
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState title="No locations in this layer." />
              )
            }
          </AsyncView>
        </Panel>
      </div>
    </>
  );
}
