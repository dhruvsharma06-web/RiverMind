import { Check, Info, ShieldCheck, X } from "lucide-react";
import type { Verification } from "@/lib/contracts";
import { dateTime } from "@/lib/format";
import { Badge, Panel, PanelTitle } from "./ui/shared";
export function VerificationCard({
  verification: v,
}: {
  verification: Verification;
}) {
  const c = v.checks;
  const checks = [
    {
      label: "In the right place",
      passed: c.geo.passed,
      detail: `${c.geo.distance_m.toFixed(1)} m from the quest · ${c.geo.source} location`,
    },
    {
      label: "In the right order",
      passed: c.time.passed,
      detail:
        "Before photo follows the claim; after photo follows the before photo.",
    },
    {
      label: "Original evidence",
      passed: c.duplicate.passed,
      detail: `Nearest image fingerprint distance: ${c.duplicate.nearest_hamming}`,
    },
    {
      label: "The same stretch",
      passed: c.scene_match.passed,
      detail: `${c.scene_match.inliers} matching scene features`,
    },
    {
      label: "Less visible waste",
      passed: c.count_drop.passed,
      detail: `${c.count_drop.before_count} items before → ${c.count_drop.after_count} after`,
    },
    {
      label: "Vision-model assessment",
      passed: c.llm.passed,
      detail: c.llm.notes,
    },
    {
      label: "Image integrity",
      passed: !c.manipulation.flagged,
      detail: c.manipulation.flagged
        ? "Possible manipulation flagged"
        : "No manipulation flag returned",
    },
    {
      label: "Sensor context",
      passed: null,
      detail:
        c.sensor.turbidity_delta === null
          ? "Context only · unavailable, not used for the decision"
          : `Turbidity delta ${c.sensor.turbidity_delta} NTU · context only`,
    },
  ];
  return (
    <Panel className="verification-panel">
      <PanelTitle
        aside={
          <Badge tone={v.passed ? "aqua" : "red"}>
            {v.passed ? "Policy passed" : "Policy rejected"}
          </Badge>
        }
      >
        The evidence, explained.
      </PanelTitle>
      <div className="verification-hero">
        <ShieldCheck size={28} strokeWidth={1.2} />
        <div>
          <h3>
            {v.passed
              ? "The cleanup checks passed."
              : "This evidence was not accepted."}
          </h3>
          <p>{v.explanation}</p>
        </div>
      </div>
      <div className="verification-checks">
        {checks.map((check) => (
          <div className="verification-check" key={check.label}>
            <span
              className={
                check.passed === null
                  ? "check-context"
                  : check.passed
                    ? "check-pass"
                    : "check-fail"
              }
            >
              {check.passed === null ? (
                <Info size={15} />
              ) : check.passed ? (
                <Check size={15} />
              ) : (
                <X size={15} />
              )}
            </span>
            <div>
              <strong>{check.label}</strong>
              <p>{check.detail}</p>
            </div>
            <span>
              {check.passed === null
                ? "Context"
                : check.passed
                  ? "Passed"
                  : "Failed"}
            </span>
          </div>
        ))}
      </div>
      <details className="verification-details">
        <summary>Decision notes and technical details</summary>
        <ul>
          {v.reasons.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>
        <p>
          Backend display score: {v.score.toFixed(2)} · This score alone does
          not decide the outcome.
        </p>
        <p>
          Model: {v.model_version} · {dateTime(v.created_at)}
        </p>
        <p>
          The backend computes the final decision. A verification pass is
          separate from payment confirmation.
        </p>
      </details>
    </Panel>
  );
}
