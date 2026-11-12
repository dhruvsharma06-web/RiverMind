import {
  ArrowRight,
  Camera,
  Check,
  CircleCheck,
  Compass,
  MapPin,
  ShieldCheck,
  Waves,
} from "lucide-react";
const stages = [
  {
    title: "Find a cleanup",
    label: "Discover",
    icon: Compass,
    text: "Pollution signals become funded quests. Explore the river and choose a stretch to help.",
    footer: "Detect → propose → fund",
  },
  {
    title: "Show the change",
    label: "Prove",
    icon: Camera,
    text: "Claim a quest and capture before and after photos with location and time.",
    footer: "Claim → clean → submit proof",
  },
  {
    title: "Close the loop",
    label: "Reward",
    icon: ShieldCheck,
    text: "Backend policy checks the evidence. Approved work moves to a PayPal sandbox payout.",
    footer: "Verify → approve → pay",
  },
];
export function PhoneWorkflow({ compact = false }: { compact?: boolean }) {
  return (
    <section
      className={`phone-workflow${compact ? " phone-workflow-compact" : ""}`}
      aria-label="RiverMind workflow previews"
    >
      {stages.map(({ title, label, icon: Icon, text, footer }, index) => (
        <article className="phone-workflow-item" key={label}>
          <div className="workflow-phone">
            <div className="phone-island">
              <span />
              {label}
            </div>
            <div className="phone-brand">
              <Waves size={17} />
              <span>rivermind.</span>
              <small>Preview</small>
            </div>
            <div className="phone-tabs" aria-hidden="true">
              {stages.map((stage) => (
                <span
                  className={stage.label === label ? "selected" : ""}
                  key={stage.label}
                >
                  {stage.label}
                </span>
              ))}
            </div>
            <div className="phone-art" aria-hidden="true">
              {index === 0 ? (
                <>
                  <svg viewBox="0 0 240 105" preserveAspectRatio="none">
                    <path
                      d="M140-10C40 22 205 55 108 76S58 110 95 130"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="34"
                    />
                  </svg>
                  <MapPin size={26} className="phone-map-pin" />
                </>
              ) : index === 1 ? (
                <div className="phone-proof-pair">
                  <span>
                    <Camera size={23} />
                    Before photo
                  </span>
                  <ArrowRight size={15} />
                  <span>
                    <Waves size={23} />
                    After photo
                  </span>
                </div>
              ) : (
                <div className="phone-payment">
                  <CircleCheck size={38} strokeWidth={1.3} />
                  <span>
                    Evidence first.
                    <br />
                    Reward follows.
                  </span>
                </div>
              )}
            </div>
            <div className="phone-content">
              <h2>
                <Icon size={17} />
                {title}
              </h2>
              <p>{text}</p>
            </div>
            <ul className="phone-facts">
              {(index === 0
                ? [
                    "Posted cleanup area",
                    "Reward reserved upfront",
                    "Location shown on the atlas",
                  ]
                : index === 1
                  ? [
                      "Before & after photos",
                      "Location & capture time",
                      "Duplicate & scene checks",
                    ]
                  : [
                      "Backend verification policy",
                      "Council review when required",
                      "Masked payment record",
                    ]
              ).map((fact) => (
                <li key={fact}>
                  <span />
                  {fact}
                </li>
              ))}
            </ul>
            <div className="phone-foot">
              <Check size={13} />
              {footer}
            </div>
            <span className="phone-home" aria-hidden="true" />
          </div>
          <div className="phone-caption">
            <span>0{index + 1}</span>
            <strong>{label}</strong>
          </div>
          {index < 2 && (
            <ArrowRight
              className="phone-between"
              size={22}
              aria-hidden="true"
            />
          )}
        </article>
      ))}
    </section>
  );
}
