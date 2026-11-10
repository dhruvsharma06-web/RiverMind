import Link from "next/link";
import {
  ArrowDown,
  ArrowUpRight,
  Camera,
  Compass,
  Cpu,
  FlaskConical,
  Heart,
  Scale,
  ShieldCheck,
  Wallet,
  Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, PageHeading, Panel, PanelTitle } from "@/components/ui/shared";
const steps = [
  {
    icon: Camera,
    title: "Notice the need.",
    text: "A camera frame or sensor reading reaches the backend. Waste detection or a sensor anomaly can create a pollution event.",
  },
  {
    icon: Cpu,
    title: "Give the river a voice.",
    text: "The AI proposes a cleanup and explains why it matters. Backend code applies budget limits before posting a bounty.",
  },
  {
    icon: Compass,
    title: "Put care into motion.",
    text: "A worker claims the quest with a name and PayPal sandbox email, then records before-and-after photos with browser location and time.",
  },
  {
    icon: ShieldCheck,
    title: "Make the evidence count.",
    text: "Location, timing, duplicate photos, scene matching, waste reduction, and a vision-model vote feed the backend’s verification policy.",
  },
  {
    icon: Wallet,
    title: "Reward the work.",
    text: "Verified work follows the payment policy. Higher-value payments await council approval, and PayPal sandbox payout status is visible in the ledger.",
  },
];
export default function AboutPage() {
  return (
    <>
      <PageHeading
        chapter="About"
        title="How RiverMind works"
        description="From the first pollution signal to a verified cleanup and a transparent payout."
      />
      <div className="about-intro">
        <Waves size={36} strokeWidth={1} />
        <h2>Concern becomes a clear next step.</h2>
        <p>
          Our first expedition follows the Yamuna in Delhi. This hackathon
          prototype brings sensing, cleanup work, and a shared treasury into one
          journey—so help can reach a specific place, at a specific moment.
        </p>
        <Badge tone="gold">
          PayPal AI Hackathon · 2026 · Sandbox prototype
        </Badge>
      </div>
      <div className="about-steps">
        {steps.map(({ icon: Icon, title, text }, i) => (
          <article key={title}>
            <span className="about-step-number">0{i + 1}</span>
            <div className="about-step-icon">
              <Icon size={26} strokeWidth={1.3} />
            </div>
            <div>
              <h2>{title}</h2>
              <p>{text}</p>
            </div>
            {i < steps.length - 1 && (
              <ArrowDown className="about-step-arrow" size={18} />
            )}
          </article>
        ))}
      </div>
      <Panel>
        <PanelTitle>Where the decisions live.</PanelTitle>
        <div className="architecture-flow">
          {[
            [Camera, "Signals", "Camera / device"],
            [Cpu, "AI", "Proposes & scores"],
            [Scale, "Backend", "Applies policy"],
            [ShieldCheck, "Evidence", "Checks cleanup"],
            [Wallet, "PayPal", "Sandbox payment"],
          ].map(([Icon, title, description]) => {
            const Symbol = Icon as typeof Camera;
            return (
              <div key={String(title)}>
                <Symbol size={22} strokeWidth={1.3} />
                <strong>{String(title)}</strong>
                <span>{String(description)}</span>
              </div>
            );
          })}
        </div>
        <p className="chart-source">
          The backend is the authority for amounts, verification decisions,
          reservations, and payments. AI outputs are proposals and scores.
        </p>
      </Panel>
      <div className="about-role-grid">
        <Panel>
          <Heart size={23} className="text-accent" />
          <h2>Explore & contribute.</h2>
          <p>
            Public visitors can see readings, events, quests, donations, and
            masked payout records. No account is required.
          </p>
          <Button asChild variant="secondary">
            <Link href="/donate">
              Meet the treasury
              <ArrowUpRight size={14} />
            </Link>
          </Button>
        </Panel>
        <Panel>
          <Compass size={23} className="text-accent" />
          <h2>Become a cleanup worker.</h2>
          <p>
            A name and sandbox email start a claim. A private claim token grants
            proof access for that individual quest.
          </p>
          <Button asChild variant="secondary">
            <Link href="/bounties">
              Find a cleanup
              <ArrowUpRight size={14} />
            </Link>
          </Button>
        </Panel>
        <Panel>
          <ShieldCheck size={23} className="text-accent" />
          <h2>Steward the funds.</h2>
          <p>
            Council members use an API key to approve, veto, or retry eligible
            payments. Every action is authorized by the backend.
          </p>
          <Button asChild variant="secondary">
            <Link href="/council">
              Council workspace
              <ArrowUpRight size={14} />
            </Link>
          </Button>
        </Panel>
      </div>
      <div className="about-bottom-grid">
        <Panel>
          <PanelTitle>Reading the water.</PanelTitle>
          <dl className="parameter-glossary">
            <div>
              <dt>Turbidity · NTU</dt>
              <dd>
                A measure of how cloudy the water is. Changes can indicate a
                need to investigate.
              </dd>
            </div>
            <div>
              <dt>pH</dt>
              <dd>
                Indicates how acidic or alkaline a sample is. A reading alone
                does not establish water safety.
              </dd>
            </div>
            <div>
              <dt>Total dissolved solids · ppm</dt>
              <dd>
                Describes the concentration of dissolved material in a sample.
              </dd>
            </div>
            <div>
              <dt>Temperature · °C</dt>
              <dd>
                Adds context to the other measurements and changes over time.
              </dd>
            </div>
          </dl>
        </Panel>
        <Panel>
          <PanelTitle
            aside={<FlaskConical size={18} className="text-accent" />}
          >
            Honest limits. Clear expectations.
          </PanelTitle>
          <ul className="honest-limits">
            <li>
              PayPal uses sandbox or labelled mock mode. No real money moves.
            </li>
            <li>
              Simulated readings and mock AI results are labelled. Demo mode is
              a session-based simulation.
            </li>
            <li>
              The river indicator is a prototype operational score, not a
              certified water-quality index.
            </li>
            <li>
              The interface does not certify water safety or guarantee
              environmental outcomes.
            </li>
            <li>
              No XP, levels, or fictional impact statistics stand in for
              verified cleanup work.
            </li>
            <li>
              Illustrated landscapes are decorative and never used as cleanup
              evidence.
            </li>
          </ul>
        </Panel>
      </div>
      <div className="about-cta">
        <Waves size={28} strokeWidth={1} />
        <h2>Find a stretch. Start a chapter.</h2>
        <Button asChild>
          <Link href="/atlas">
            Explore the river atlas
            <ArrowUpRight size={16} />
          </Link>
        </Button>
      </div>
    </>
  );
}
