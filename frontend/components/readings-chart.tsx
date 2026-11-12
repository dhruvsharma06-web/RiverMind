"use client";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { memo, useId, useMemo } from "react";
import type { Reading } from "@/lib/contracts";
import { EmptyState } from "./ui/shared";
import { parameters, type ReadingParameter } from "@/lib/reading-parameters";
export { parameters, type ReadingParameter } from "@/lib/reading-parameters";
const timeFormatter = new Intl.DateTimeFormat("en-IN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "Asia/Kolkata",
});
const formatTime = (time: number) => timeFormatter.format(new Date(time));
export default memo(function ReadingsChart({
  readings,
  parameter = "turbidity_ntu",
}: {
  readings: Reading[];
  parameter?: ReadingParameter;
}) {
  const id = useId().replaceAll(":", "");
  const info = parameters[parameter];
  const data = useMemo(
    () =>
      [...readings]
        .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
        .map((r) => ({ ...r, time: Date.parse(r.ts) })),
    [readings],
  );
  if (!readings.length)
    return (
      <EmptyState title="Waiting for a reading.">
        Measurements will appear once a device or simulator sends them.
      </EmptyState>
    );
  return (
    <div
      className="readings-chart"
      role="img"
      aria-label={`${info.label} across ${data.length} available readings. Latest: ${data.at(-1)?.[parameter]} ${info.unit}. Time axis in IST.`}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart
          data={data}
          margin={{ top: 16, right: 12, bottom: 4, left: -18 }}
          accessibilityLayer
        >
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--chart-line, #8bd3c6)"
                stopOpacity={0.2}
              />
              <stop
                offset="100%"
                stopColor="var(--chart-line, #8bd3c6)"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="var(--chart-grid, #26414a)"
            vertical={false}
            strokeDasharray="3 6"
          />
          <XAxis
            dataKey="time"
            tickFormatter={formatTime}
            tick={{ fill: "var(--chart-label, #a5b7bf)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            minTickGap={45}
          />
          <YAxis
            tick={{ fill: "var(--chart-label, #a5b7bf)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            domain={["auto", "auto"]}
          />
          <Tooltip
            labelFormatter={(label) => `${formatTime(Number(label))} IST`}
            formatter={(value) => [`${value} ${info.unit}`, info.label]}
            contentStyle={{
              background: "var(--dash-panel, #122530)",
              color: "var(--dash-ink, #f3f0e8)",
              border: "1px solid var(--dash-line, #42606d)",
              borderRadius: 10,
              fontSize: 12,
            }}
          />
          <Area
            type="linear"
            dataKey={parameter}
            stroke="var(--chart-line, #8bd3c6)"
            strokeWidth={2.5}
            fill={`url(#${id})`}
            isAnimationActive={false}
            dot={
              data.length <= 30
                ? { r: 4, fill: "var(--chart-line, #8bd3c6)", strokeWidth: 0 }
                : false
            }
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});
