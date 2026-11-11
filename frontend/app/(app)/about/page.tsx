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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeading, Panel, PanelTitle } from "@/components/ui/shared";
const steps = [
  {
    icon: Camera,
    title: "Detect",
    text: "A camera frame or sensor reading reaches the backend. Waste detection or a sensor anomaly can create a pollution event.",
  },
  {
    icon: Cpu,
    title: "Propose",
    text: "The AI proposes a cleanup and says why. Backend code applies budget limits before posting a quest.",
  },
  {
    icon: Compass,
    title: "Claim",
    text: "A worker claims the quest with a name and PayPal sandbox email, then takes before and after photos with browser location and time.",
  },
  {
    icon: ShieldCheck,
    title: "Verify",
    text: "Location, timing, duplicate photos, scene matching, waste reduction, and a vision-model vote feed the backend’s verification policy.",
  },
  {
    icon: Wallet,
    title: "Pay",
    text: "Verified work follows the payment policy. Higher-value payments await council approval, and PayPal sandbox payout status is visible in the ledger.",
  },
];
export default function AboutPage() {
  return (
    <>
      <PageHeading
        chapter="About"
        title="How RiverMind works"
        description="From a pollution signal to a verified cleanup and a payout."
      />
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
        <PanelTitle>Who decides what</PanelTitle>
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
          <h2>Visitors</h2>
          <p>
            Public visitors can see readings, events, quests, donations, and
            masked payout records. No account is required.
          </p>
          <Button asChild variant="secondary">
            <Link href="/donate">
              River treasury
              <ArrowUpRight size={14} />
            </Link>
          </Button>
        </Panel>
        <Panel>
          <Compass size={23} className="text-accent" />
          <h2>Cleanup workers</h2>
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
          <h2>Council</h2>
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
          <PanelTitle>Reading the water</PanelTitle>
          <dl className="parameter-glossary">
            <div>
              <dt>Turbidity · NTU</dt>
              <dd>
                How cloudy the water is. A change can be worth investigating.
              </dd>
            </div>
            <div>
              <dt>pH</dt>
              <dd>
                How acidic or alkaline a sample is. One reading does not
                establish water safety.
              </dd>
            </div>
            <div>
              <dt>Total dissolved solids · ppm</dt>
              <dd>Concentration of dissolved material in a sample.</dd>
            </div>
            <div>
              <dt>Temperature · °C</dt>
              <dd>Context for the other readings.</dd>
            </div>
          </dl>
        </Panel>
        <Panel>
          <PanelTitle
            aside={<FlaskConical size={18} className="text-accent" />}
          >
            Limits
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
              Illustrations and stock river footage are decorative, not the
              Yamuna, and never used as cleanup evidence.
            </li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
