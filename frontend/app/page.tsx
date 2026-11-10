import Link from "next/link";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import {
  LandingStats,
  AtlasPreview,
  TreasuryPreview,
} from "@/components/landing-data";
import { LandingQuest } from "@/components/landing-quest";
import { RiverHeroMedia } from "@/components/river-hero-media";
import { WaterBackdrop } from "@/components/water-backdrop";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/shared";

const steps = [
  [
    "Spot",
    "Cameras and water sensors flag waste or a bad reading at a point on the river.",
  ],
  [
    "Fund",
    "A cleanup quest opens with a location, a scope and a reward already set aside from the treasury.",
  ],
  [
    "Prove",
    "You upload before and after photos. Location, timing and AI checks decide, then PayPal pays you.",
  ],
];

const questions = [
  [
    "What exactly is RiverMind?",
    "A hackathon prototype that gives the Yamuna an AI agent and a shared treasury. It links pollution detection to funded cleanup quests, evidence checks and PayPal sandbox payouts.",
  ],
  [
    "Are these real payments and live measurements?",
    "No real money moves: PayPal runs in sandbox or a clearly labelled mock mode. Sensor readings say when they are simulated, and the demo uses prepared examples.",
  ],
  [
    "How do you know a cleanup actually happened?",
    "The backend compares location, photo timing, duplicates, scene match and waste count, plus a vision-model vote. You see every check and the reason for any rejection. Demo results are labelled simulated.",
  ],
  [
    "Where does a donation go?",
    "Into the river’s shared treasury. Budget rules reserve each quest reward, payouts follow verification and council approval, and the public ledger lists each one with a masked recipient.",
  ],
];

export default function LandingPage() {
  return (
    <div className="landing-experience">
      <MarketingNav />
      <WaterBackdrop startAfter={240} />
      <main id="main-content">
        <section className="river-hero">
          <RiverHeroMedia />
          <div className="experience-container">
            <div className="experience-hero-copy">
              <h1>
                A river with a voice.
                <br />
                <span>A cleanup with proof.</span>
              </h1>
              <p>
                RiverMind spots pollution on the Yamuna, posts a funded cleanup
                quest, checks the proof with AI and pays the person who did the
                work through PayPal (sandbox).
              </p>
              <div className="experience-actions">
                <Button asChild>
                  <Link href="/river">
                    Open the overview
                    <ArrowUpRight size={18} />
                  </Link>
                </Button>
                <a className="experience-story-link" href="#story">
                  How it works
                  <ArrowDown size={18} />
                </a>
              </div>
            </div>
          </div>
        </section>

        <section id="story" className="landing-steps experience-section">
          <div className="experience-container landing-steps-grid">
            <h2>How it works</h2>
            <ol className="step-list">
              {steps.map(([title, text]) => (
                <li key={title}>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="expedition" className="landing-live experience-section">
          <div className="experience-container">
            <div className="landing-heading-row">
              <h2>The river right now</h2>
              <Link className="experience-text-link" href="/atlas">
                Explore the river
                <ArrowUpRight size={18} />
              </Link>
            </div>
            <div className="landing-live-grid">
              <LandingStats />
              <AtlasPreview />
            </div>
          </div>
        </section>

        <section className="landing-quest experience-section">
          <div className="experience-container">
            <div className="landing-heading-row">
              <h2>A quest you can take today</h2>
              <Link className="experience-text-link" href="/bounties">
                All quests
                <ArrowUpRight size={18} />
              </Link>
            </div>
            <LandingQuest />
          </div>
        </section>

        <section id="funding" className="landing-funding experience-section">
          <div className="experience-container landing-funding-grid">
            <div>
              <h2>Fund the next cleanup</h2>
              <p>
                Donations go into the river’s shared treasury. A quest’s reward
                is reserved before it opens and paid only after the proof
                passes. Every payout is listed on the public ledger.
              </p>
              <Button asChild>
                <Link href="/donate">
                  Donate
                  <ArrowUpRight size={18} />
                </Link>
              </Button>
              <small className="funding-honesty">
                USD · PayPal sandbox or labelled mock · no real money moves
              </small>
            </div>
            <TreasuryPreview />
          </div>
        </section>

        <section className="landing-faq experience-section">
          <div className="experience-container landing-faq-layout">
            <h2>Questions</h2>
            <div className="faq-list">
              {questions.map(([question, answer]) => (
                <details key={question}>
                  <summary>
                    {question}
                    <span className="faq-plus" aria-hidden="true">
                      +
                    </span>
                  </summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>
      <footer className="experience-footer">
        <div className="experience-container">
          <div className="experience-footer-top">
            <div>
              <Logo />
            </div>
            <div>
              <h3>Explore</h3>
              <Link href="/river">Overview</Link>
              <Link href="/atlas">River atlas</Link>
              <Link href="/bounties">Cleanup quests</Link>
            </div>
            <div>
              <h3>Take part</h3>
              <Link href="/donate">River treasury</Link>
              <Link href="/council">Council workspace</Link>
              <Link href="/about">How it works</Link>
            </div>
            <div>
              <h3>Project</h3>
              <a
                href="https://github.com/dhruvsharma06-web/RiverMind"
                target="_blank"
                rel="noreferrer"
              >
                Source code
                <ArrowUpRight size={14} />
              </a>
              <span>PayPal AI Hackathon 2026</span>
            </div>
          </div>
          <div className="experience-footer-bottom">
            <span>RiverMind · Yamuna, Delhi · sandbox prototype</span>
            <span>
              Background and hero footage: Pexels — illustrative, not the Yamuna
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
