"use client";
import { FlaskConical, Radio } from "lucide-react";
import { api } from "@/lib/api";
import { useHealth } from "@/lib/queries";
import { Badge } from "./ui/shared";
import { INR_RATE_NOTE, INR_RATE_SOURCE } from "@/lib/currency";
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
  return (
    <div className="demo-banner">
      <FlaskConical size={15} />
      <span>
        {api.mode === "fixture" &&
          "Simulated readings, verification and payments · "}
        <a
          href={INR_RATE_SOURCE}
          target="_blank"
          rel="noreferrer"
          title={INR_RATE_NOTE}
        >
          INR estimates · USD checkout
        </a>
      </span>
    </div>
  );
}
