"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SignalDay } from "@/lib/reports";

export default function ActivityChart({ days }: { days: SignalDay[] }) {
  return (
    <div
      className="activity-chart"
      role="img"
      aria-label={`Available signals by day: ${days.reduce((sum, day) => sum + day.waste, 0)} waste detections and ${days.reduce((sum, day) => sum + day.sensor, 0)} sensor anomalies. Dates in IST.`}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart
          data={days}
          margin={{ top: 12, right: 4, left: -28, bottom: 0 }}
          accessibilityLayer
          barSize={14}
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--chart-grid)"
            strokeDasharray="3 6"
          />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--chart-label)", fontSize: 10 }}
            minTickGap={16}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--chart-label)", fontSize: 10 }}
          />
          <Tooltip
            cursor={{ fill: "var(--dash-soft)" }}
            contentStyle={{
              background: "var(--dash-panel)",
              color: "var(--dash-ink)",
              border: "1px solid var(--dash-line)",
              borderRadius: 10,
              fontSize: 12,
            }}
          />
          <Bar
            dataKey="waste"
            name="Waste detections"
            stackId="signals"
            fill="var(--viz-water)"
            isAnimationActive={false}
          />
          <Bar
            dataKey="sensor"
            name="Sensor anomalies"
            stackId="signals"
            fill="var(--viz-sand)"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
