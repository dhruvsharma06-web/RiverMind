import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Camera,
  Compass,
  Heart,
  Layers3,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { MarketingNav } from "@/components/marketing-nav";
import {
  LandingStats,
  AtlasPreview,
  ObservatoryPreview,
  TreasuryPreview,
  RiverDiary,
} from "@/components/landing-data";
import { LandingQuest } from "@/components/landing-quest";
import { RiverHeroMedia } from "@/components/river-hero-media";
import { WaterFlow } from "@/components/water-flow";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/shared";

const questions = [
  [
    "What exactly is RiverMind?",
    "RiverMind is a hackathon prototype that gives a river an AI agent and a shared treasury. It connects pollution detection to funded cleanup quests, evidence verification, and PayPal sandbox payments.",
  ],
  [
    "Do I need an account to help?",
    "No account is required to explore the river or donate. To claim a cleanup, enter your name and a PayPal sandbox personal-account email. Your private claim token stays in this browser session; save a recovery copy before closing the tab.",
  ],
  [
    "Are these real payments and live measurements?",
    "PayPal operates in sandbox or explicitly labelled mock mode; no real money moves. Sensor readings show whether they are simulated. The interactive demo uses prepared examples and a session-based simulator. The 3D story is an illustration of the process.",
  ],
  [
    "How do you know a cleanup actually happened?",
    "The backend combines location, photo timing, duplicate detection, scene matching, waste-count reduction, and a vision-model vote. Backend policy makes the overall decision. The interface shows each check and the reason for a rejection. Demo-mode results are labelled simulated.",
  ],
  [
    "Where does a donation go?",
    "Donations enter the river’s shared treasury. Backend budget rules reserve funds for cleanup bounties, and payouts follow verification and council approval rules. The public ledger shows masked recipients and transaction status. Donations do not guarantee a particular environmental outcome.",
  ],
];

export default function LandingPage() {
  return (
    <div className="landing-experience">
      <MarketingNav />
      <main id="main-content">
        <section className="experience-hero river-hero">
          <RiverHeroMedia pinned />
          <div className="experience-container">
            <div className="experience-hero-copy">
              <h1>
                A river with a voice.
                <br />
                <span>A cleanup with proof.</span>
              </h1>
              <p>
                RiverMind spots pollution on the Yamuna, posts cleanup bounties,
                verifies the work with AI and pays the person who did it through
                PayPal.
              </p>
              <div className="experience-actions">
                <Button asChild>
                  <Link href="/river">
                    Open the overview
                    <ArrowUpRight size={16} />
                  </Link>
                </Button>
                <a className="experience-story-link" href="#story">
                  How it works
                  <ArrowDown size={15} />
                </a>
              </div>
              <div className="experience-hero-trust">
                <ShieldCheck size={15} />
                <span>AI-assisted verification</span>
                <span className="trust-divider" />
                <span>PayPal sandbox rewards</span>
              </div>
            </div>
          </div>
          <a
            href="#story"
            className="experience-scroll-cue"
            aria-label="Scroll to how it works"
          >
            <ArrowDown size={16} />
          </a>
          <span className="river-hero-credit">
            River footage via Pexels · illustrative, not the Yamuna
          </span>
        </section>

        <WaterFlow className="water-flow-curtain" />
        <section
          className="experience-snapshot"
          aria-label="Latest river snapshot"
        >
          <div className="experience-container">
            <LandingStats />
          </div>
        </section>

        <section id="story" className="experience-purpose experience-section">
          <div className="experience-container">
            <div className="experience-section-heading">
              <span className="experience-kicker">HOW IT WORKS</span>
              <h2>
                The river needs more
                <br />
                than another alert.
              </h2>
              <p>
                It needs a path from “something should change” to “someone made
                it happen.” That’s the missing connection RiverMind brings
                together.
              </p>
            </div>
            <div className="experience-purpose-grid">
              {[
                {
                  icon: Radio,
                  title: "Detect pollution.",
                  text: "Camera frames and water readings make the need visible, with location and context.",
                  tone: "coral",
                  number: "01",
                },
                {
                  icon: Compass,
                  title: "Post a funded quest.",
                  text: "A clear cleanup scope and a funded reward turn concern into a place to begin.",
                  tone: "aqua",
                  number: "02",
                },
                {
                  icon: ShieldCheck,
                  title: "Verify, then pay.",
                  text: "Evidence and backend rules connect the work to its verification and payment.",
                  tone: "green",
                  number: "03",
                },
              ].map(({ icon: Icon, title, text, tone, number }) => (
                <article
                  className={`purpose-card purpose-${tone}`}
                  key={number}
                >
                  <div>
                    <span>
                      <Icon size={23} />
                    </span>
                    <small>{number}</small>
                  </div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="expedition"
          className="experience-workspace experience-section"
        >
          <div className="experience-container">
            <div className="experience-section-heading experience-heading-row">
              <div>
                <span className="experience-kicker">
                  YOUR WINDOW INTO THE RIVER
                </span>
                <h2>
                  A world to explore.
                  <br />A clear place to begin.
                </h2>
              </div>
              <Link className="experience-text-link" href="/river">
                Open the workspace
                <ArrowUpRight size={16} />
              </Link>
            </div>
            <div className="experience-workspace-grid">
              <div className="experience-workspace-card">
                <div className="workspace-preview-heading">
                  <span>
                    <Compass size={17} />
                  </span>
                  <div>
                    <h3>Follow the need.</h3>
                    <p>Explore events and quests along the Yamuna.</p>
                  </div>
                </div>
                <AtlasPreview />
                <Link className="experience-text-link" href="/atlas">
                  Explore the river
                  <ArrowUpRight size={15} />
                </Link>
              </div>
              <div className="experience-workspace-card">
                <div className="workspace-preview-heading">
                  <span>
                    <Layers3 size={17} />
                  </span>
                  <div>
                    <h3>Listen to the signals.</h3>
                    <p>See the latest available water readings.</p>
                  </div>
                </div>
                <ObservatoryPreview />
                <Link className="experience-text-link" href="/river">
                  See the overview
                  <ArrowUpRight size={15} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="experience-quests experience-section">
          <div className="experience-container">
            <div className="experience-section-heading experience-heading-row">
              <div>
                <span className="experience-kicker">YOUR NEXT GOOD THING</span>
                <h2>
                  A small quest.
                  <br />A tangible difference.
                </h2>
              </div>
              <p>
                Start with a real cleanup opportunity. The scope, evidence
                requirements, and reward are there before you claim.
              </p>
            </div>
            <LandingQuest />
          </div>
        </section>

        <WaterFlow />
        <section id="funding" className="experience-funding experience-section">
          <div className="experience-container experience-funding-grid">
            <div>
              <span className="experience-kicker">
                <Heart size={14} />
                MAKE THE NEXT CHAPTER POSSIBLE
              </span>
              <h2>
                Give a little.
                <br />
                Keep care moving.
              </h2>
              <p>
                Behind every cleanup is someone willing to help—and someone
                willing to fund it. Contributions support quests through the
                river’s shared treasury.
              </p>
              <div className="funding-principles">
                <span>
                  <ShieldCheck size={16} />
                  Budget rules reserve each reward.
                </span>
                <span>
                  <Camera size={16} />
                  Evidence comes before payment.
                </span>
                <span>
                  <Layers3 size={16} />A public ledger keeps the trail visible.
                </span>
              </div>
              <Button asChild>
                <Link href="/donate">
                  Support the river
                  <ArrowUpRight size={16} />
                </Link>
              </Button>
              <small className="funding-honesty">
                USD · PayPal sandbox / labelled mock · No real money moves
              </small>
            </div>
            <TreasuryPreview />
          </div>
        </section>

        <section className="experience-diary experience-section">
          <div className="experience-container">
            <RiverDiary />
          </div>
        </section>

        <section className="experience-faq experience-section">
          <div className="experience-container experience-faq-layout">
            <div>
              <span className="experience-kicker">A FEW THINGS TO KNOW</span>
              <h2>
                Clear questions.
                <br />
                Clear answers.
              </h2>
              <p>Understand the process before you take your first quest.</p>
              <Link className="experience-text-link" href="/about">
                How RiverMind works
                <ArrowUpRight size={15} />
              </Link>
            </div>
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

        <section className="experience-invitation">
          <div className="experience-container">
            <div className="invitation-art">
              <RiverHeroMedia
                className="invitation-media"
                priority={false}
                sizes="(max-width: 800px) 100vw, 600px"
              />
            </div>
            <div className="experience-invitation-copy">
              <span className="experience-kicker">
                SOME STORIES ARE WRITTEN IN WATER.
              </span>
              <h2>
                Help write
                <br />
                the next one.
              </h2>
              <p>A little collective care can start with you.</p>
              <div className="experience-actions">
                <Button asChild>
                  <Link href="/bounties">
                    Find your first quest
                    <ArrowUpRight size={16} />
                  </Link>
                </Button>
                <Link className="experience-story-link" href="/donate">
                  Fund the change
                  <Heart size={16} />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="experience-footer">
        <div className="experience-container">
          <div className="experience-footer-top">
            <div>
              <Logo />
              <p>
                A river with a voice.
                <br />A cleanup with proof.
              </p>
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
              <h3>The project</h3>
              <a
                href="https://github.com/dhruvsharma06-web/RiverMind"
                target="_blank"
                rel="noreferrer"
              >
                Source code
                <ArrowUpRight size={12} />
              </a>
              <span>PayPal AI Hackathon · 2026</span>
              <span>Yamuna, Delhi · Sandbox prototype</span>
            </div>
          </div>
          <div className="experience-footer-bottom">
            <span>RiverMind · Every action leaves a trace.</span>
            <Link href="/river">
              Meet your river
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
