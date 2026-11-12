import Link from "next/link";
import { ArrowUpRight, FlaskConical } from "lucide-react";
import { PhoneWorkflow } from "@/components/phone-workflow";
import { Button } from "@/components/ui/button";
import { PageHeading, Panel, PanelTitle } from "@/components/ui/shared";

export default function AboutPage() {
  return (
    <div className="about-summary">
      <PageHeading
        chapter="About"
        title="How RiverMind works"
        description="From a pollution signal to a verified cleanup and a payout."
        action={
          <Button asChild variant="secondary">
            <Link href="/river">
              Open overview
              <ArrowUpRight size={15} />
            </Link>
          </Button>
        }
      />
      <PhoneWorkflow compact />
      <div className="about-detail-grid">
        <Panel>
          <PanelTitle>Access & responsibility</PanelTitle>
          <div className="about-panel-body">
            <dl className="about-access">
              <div>
                <dt>Workers</dt>
                <dd>
                  Sign in to access the workspace, claim quests, submit proof
                  and donate.
                </dd>
              </div>
              <div>
                <dt>Council</dt>
                <dd>
                  Council accounts can approve, veto or retry eligible payments.
                  The backend checks permissions.
                </dd>
              </div>
              <div>
                <dt>Backend policy</dt>
                <dd>
                  Controls amounts, evidence decisions and payments. AI proposes
                  and scores.
                </dd>
              </div>
            </dl>
            <div className="about-quick-links">
              <Link href="/bounties">
                Find a quest
                <ArrowUpRight size={13} />
              </Link>
              <Link href="/council">
                Council
                <ArrowUpRight size={13} />
              </Link>
              <Link href="/donate">
                Treasury
                <ArrowUpRight size={13} />
              </Link>
            </div>
          </div>
        </Panel>
        <Panel>
          <PanelTitle>Reading the water</PanelTitle>
          <div className="about-panel-body">
            <dl className="about-measurements">
              <div>
                <dt>
                  Turbidity <span>NTU</span>
                </dt>
                <dd>How cloudy the water is.</dd>
              </div>
              <div>
                <dt>
                  Water pH <span>pH</span>
                </dt>
                <dd>How acidic or alkaline a sample is.</dd>
              </div>
              <div>
                <dt>
                  Dissolved solids <span>ppm</span>
                </dt>
                <dd>Concentration of dissolved material.</dd>
              </div>
              <div>
                <dt>
                  Temperature <span>°C</span>
                </dt>
                <dd>Context for the other measurements.</dd>
              </div>
            </dl>
          </div>
        </Panel>
        <Panel>
          <PanelTitle aside={<FlaskConical size={17} aria-hidden="true" />}>
            Prototype limits
          </PanelTitle>
          <div className="about-panel-body">
            <ul className="about-limits">
              <li>
                Payments use sandbox or labelled mock mode. No real money moves.
              </li>
              <li>
                Simulated readings and mock AI results are labelled. Demo
                activity is session-based.
              </li>
              <li>
                The river indicator is operational. It does not certify water
                safety or guarantee environmental outcomes.
              </li>
              <li>
                Decorative footage and artwork are not the Yamuna or cleanup
                evidence.
              </li>
            </ul>
          </div>
        </Panel>
      </div>
    </div>
  );
}
