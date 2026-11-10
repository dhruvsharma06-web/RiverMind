"use client";
import { FlaskConical, Radio } from "lucide-react";
import { api } from "@/lib/api";
import { useHealth } from "@/lib/queries";
import { Badge } from "./ui/shared";
export function ModeStatus({ detailed = false }: { detailed?: boolean }) {
  const health = useHealth();
  return (
    <div className="mode-status">
      <Badge tone={api.mode === "fixture" ? "gold" : "aqua"}>
        {api.mode === "fixture" ? (
          <FlaskConical size={12} />
        ) : (
          <Radio size={12} />
        )}
        {api.mode === "fixture"
          ? "Interactive demo"
          : health.isError
            ? "API unavailable"
            : health.data
              ? "Connected to API"
              : "Connecting"}
      </Badge>
      {detailed && health.data && (
        <>
          <Badge>{health.data.mock_ai ? "Mock AI" : "AI enabled"}</Badge>
          <Badge>PayPal {health.data.paypal_mode}</Badge>
        </>
      )}
    </div>
  );
}
export function DemoNotice() {
  return api.mode === "fixture" ? (
    <div className="demo-banner">
      <FlaskConical size={15} />
      <span>
        Interactive demo · Simulated readings, verification, and payments. No
        real money moves.
      </span>
    </div>
  ) : null;
}
