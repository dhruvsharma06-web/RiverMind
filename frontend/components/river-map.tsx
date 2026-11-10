"use client";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
export interface AtlasPoint {
  id: string;
  lat: number;
  lon: number;
  title: string;
  kind: "quest" | "event";
  detail: string;
  bountyId?: string;
}
export default function RiverMap({
  points,
  selected,
  onSelect,
}: {
  points: AtlasPoint[];
  selected?: string;
  onSelect: (id: string) => void;
}) {
  const element = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    layer = useRef<L.LayerGroup | null>(null),
    fitted = useRef(false);
  const [tilesFailed, setTilesFailed] = useState(false);
  useEffect(() => {
    if (!element.current) return;
    const instance = L.map(element.current, { scrollWheelZoom: false }).setView(
      [28.544, 77.307],
      13,
    );
    map.current = instance;
    layer.current = L.layerGroup().addTo(instance);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    })
      .on("tileerror", () => setTilesFailed(true))
      .addTo(instance);
    return () => {
      instance.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);
  useEffect(() => {
    const instance = map.current,
      group = layer.current;
    if (!instance || !group) return;
    group.clearLayers();
    const ordered = [...points].sort(
      (a, b) => Number(a.id === selected) - Number(b.id === selected),
    );
    for (const point of ordered) {
      const active = point.id === selected;
      const marker = L.circleMarker([point.lat, point.lon], {
        radius: active ? 11 : 7,
        fillColor: point.kind === "quest" ? "#d9b978" : "#82c7bd",
        color: active ? "#fff4d5" : "#102b2c",
        weight: active ? 3 : 2,
        fillOpacity: 1,
      }).addTo(group);
      const tooltip = document.createElement("span");
      tooltip.textContent = point.title;
      marker.bindTooltip(tooltip);
      marker.on("click", () => onSelect(point.id));
      const node = marker.getElement();
      if (node) {
        node.setAttribute("tabindex", "0");
        node.setAttribute("role", "button");
        node.setAttribute("aria-label", `${point.kind}: ${point.title}`);
        node.addEventListener("keydown", (event) => {
          if (
            (event as KeyboardEvent).key === "Enter" ||
            (event as KeyboardEvent).key === " "
          ) {
            event.preventDefault();
            onSelect(point.id);
          }
        });
      }
    }
    if (points.length && !fitted.current) {
      instance.fitBounds(
        L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number])),
        { padding: [55, 55], maxZoom: 14 },
      );
      fitted.current = true;
    }
    const point = points.find((p) => p.id === selected);
    if (point)
      instance.panTo([point.lat, point.lon], {
        animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      });
  }, [points, selected, onSelect]);
  return (
    <div className="river-map-wrap">
      <div
        ref={element}
        className="river-map"
        role="region"
        aria-label="River atlas map of event and cleanup quest locations"
      />
      {tilesFailed && (
        <div className="map-error" role="status">
          Map tiles are unavailable. Coordinates and the location list below
          remain usable.
        </div>
      )}
      <div className="map-legend">
        <span>
          <i className="legend-quest" />
          Cleanup quest
        </span>
        <span>
          <i className="legend-event" />
          Pollution event
        </span>
      </div>
    </div>
  );
}
