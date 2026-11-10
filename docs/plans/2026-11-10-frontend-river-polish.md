# Frontend plan: real river hero, river-themed Overview, light professional cleanup

Status: PLAN ONLY, to be implemented in a separate session. Written 10 Nov 2026 from `main` at `05cbab5`.
Scope: `frontend/` only. AI and backend logic are out of scope; they arrive later through the existing API.

## 0. Ground rules for the implementer

- **Ownership.** `frontend/` belongs to P4 (CLAUDE.md), and rayyan made the latest frontend commits.
  - Tell them before starting, and work on a short branch `feat/fe-river-polish` cut from `origin/main`.
  - Open a PR to `main`. Do not push to `main`.
- **Do not touch:**
  - `lib/api.ts`, `lib/contracts.ts`, `lib/mock-api.ts`, `lib/queries.ts` (the only exception is the hooks in §3.1)
  - the generated `openapi.json` and `lib/api-types.ts`
  - anything under `../backend` or `../ai`
- **No behaviour changes to the journeys** (claim, proof, verify, donate, council). Keep the visual change modest: the user asked for "don't change much, don't change for the sake of it".
- **Honesty rule** (CLAUDE.md #3): the hero footage is a generic river unless someone films the Yamuna. Its caption must not claim it is the Yamuna. Simulated data stays labelled.
- **Playwright tests assert visible text.** `tests/browser/journeys.spec.ts` checks these strings:
  - Observatory, Signals over time, Every dollar, accounted for
  - Capture a change worth seeing., A little care, carried forward., Explore the river
  - Monthly reports, River atlas, and others

  Any copy you rename must be renamed in that spec in the same commit.
- **Windows dev note.** npm scripts run under cmd, which has no `node` on PATH. Prepend `C:\nodejs\node-v24.21.0-win-x64` to PATH before running `npm`. Run the demo with `NEXT_PUBLIC_USE_MOCK=true`.

### Current state
- **Landing `/`.** The hero is a cartoon isometric "river world": `components/river-world.tsx` plus floating cards. A 2.5 s "Introducing RiverMind" splash (`landing-welcome.tsx`) comes first. Flat abstract SVG blobs (`abstract-art.tsx`) are used everywhere.
- **Overview `/river`.** It opens with a decorative banner that is just an abstract SVG ("Good things start with a small ripple"). Next to it sit two cards that duplicate each other: "River indicator" and "On the river". The page is a generic SaaS dashboard with nothing river-specific.
- **CSS.** About 9,200 lines in 4 global files, of which about 1,500 are dead. Two palettes compete: `globals.css` and `dashboard.css`.
- **Copy.** Heavy "inspirational" lines ("A little care. A real difference.", "Your next good thing", "Chapter 03 / The quest journal").
- **Health.** No console errors on any route, and every route returns 200 in mock mode.

---

## 1. Landing page: a real, flowing river hero (P0 of this plan)

### 1.1 Footage (decide first; this is the only external dependency)
Use real footage of real water, not WebGL, shaders or SVG distortion. Those look like "liquid wobble" and cost the most battery.

Preferred, in this order:
1. **A teammate films the Yamuna**: the ghat at dawn, a calm wide stretch, 15-20 s, phone on a tripod or railing, no people close up.
   - This is honest. The caption may say "Yamuna, Delhi".
   - There is no licence question.
2. **A Pexels clip** of a calm, wide river at dawn or dusk, ideally aerial. Pexels allows free use and modification with no attribution required, but we credit the creator anyway. Candidates are below; open each one to check length, look and the loop seam before choosing:
   - https://www.pexels.com/video/scenic-aerial-view-of-ganges-river-in-india-30590788/ (Ganges aerial, India)
   - https://www.pexels.com/video/drone-video-of-low-clouds-over-a-river-at-sunrise-12052211/ (7 s, easy loop)
   - https://www.pexels.com/video/aerial-footage-of-water-flowing-in-the-river-8347654/ (top-down flow)
   - https://www.pexels.com/video/aerial-4k-drone-view-of-a-serene-river-landscape-29138481/
   - Avoid clips with recognisable people, brands or boats crossing the loop seam.
   - The caption must say "River footage" (not the Yamuna), with credit: "River footage: <creator> / Pexels".

**Licence handling.**
- Commit only our re-encoded, graded loop, never the original download.
- Add `frontend/public/hero/CREDITS.md`: source URL, creator, licence link, and the line "Media in this folder is not covered by the repository's MIT licence."
- Add the same note in `frontend/README.md`.

### 1.2 Encoding (target: poster ≤ 100 KB, desktop loop ≤ 2.5 MB, mobile loop ≤ 0.8 MB)
1. Pick a calm 8-10 s section and grade it slightly down: about −10 % exposure and muted saturation, so it reads photographic, not stock-glossy.
2. Make it loop. Either crossfade the last 1 s into the first 1 s with ffmpeg `xfade`, or, if the seam is ugly, play the section forward then reversed (`reverse` filter plus `concat`). Check the seam by eye.
3. Make the renditions. Commands were drafted but never run, so run and verify each one:
   ```
   ffmpeg -i loop.mp4 -an -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart -vf scale=1920:-2,fps=24 hero-1080.mp4
   ffmpeg -i loop.mp4 -an -c:v libvpx-vp9 -crf 34 -b:v 0 -row-mt 1 -vf scale=1920:-2,fps=24 hero-1080.webm
   ffmpeg -i loop.mp4 -an -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p -movflags +faststart -vf scale=854:-2,fps=24 hero-720.mp4
   ffmpeg -i loop.mp4 -vframes 1 -vf scale=1920:-2 poster.png   # → convert to poster.avif + poster.webp
   ```
4. Put the files in `frontend/public/hero/` with these names:
   - `hero-1080.webm`
   - `hero-1080.mp4`
   - `hero-720.mp4`
   - `poster.avif`
   - `poster.webp`
   - `CREDITS.md`

### 1.3 Component: `components/river-hero-media.tsx` (new, client)
- Always render the **poster** with `next/image`, `priority`, `fill`, `sizes="100vw"`, and `alt=""`. It is the LCP element.
- Mount the `<video>` only after the page is idle (`requestIdleCallback`, with a `setTimeout` fallback), and only if:
  - `prefers-reduced-motion` is not `reduce`
  - `navigator.connection?.saveData` is not true
- Video attributes: `muted loop playsInline autoPlay preload="none" aria-hidden disablePictureInPicture`.
  - Choose the source in JS: `hero-720.mp4` below 768 px wide. Otherwise use `hero-1080.webm`, then `hero-1080.mp4`. Do not rely on `<source media>`.
- Fade the video in (opacity 0 → 1 over 600 ms) on `playing`. Catch the `play()` rejection, which happens in iOS low-power mode, and keep the poster.
- Pause the video when the hero leaves the viewport (`IntersectionObserver`) and when `document.hidden` is true. Listen to the reduced-motion media query's `change` event as well.
- Scrim, one layer over the media:
  ```
  background:
    linear-gradient(90deg, rgb(8 18 24 / .62) 0%, rgb(8 18 24 / .25) 55%, transparent 80%),
    linear-gradient(180deg, rgb(8 18 24 / .35) 0%, transparent 30%, rgb(8 18 24 / .55) 100%);
  ```
  Hero text is white in both themes. Check contrast of at least 4.5:1 against the brightest frame. Use a darker scrim on mobile.
- Caption: bottom-right, 11 px, white at 70 % opacity. Text: "River footage · <credit>", or "Yamuna, Delhi · footage by <teammate>" if option 1 is used.

### 1.4 Hero layout (`app/page.tsx` + `app/landing.css`)
- Full-bleed hero: `min-height: min(100svh, 920px)`, with the media as the background and the copy aligned left inside `.experience-container`.
- Keep the existing pieces: the H1 "A river with a voice.", both CTAs, and the trust line ("AI-assisted verification · PayPal sandbox rewards").
- Plainer copy (small change):
  - Remove the kicker "A LITTLE ACTION. A DIFFERENT CURRENT."
  - Change H1 line 2 from "A future we can change." to "A cleanup with proof." This reuses the project tagline, so it is not new copy.
  - Change the paragraph to: "RiverMind spots pollution on the Yamuna, posts cleanup bounties, verifies the work with AI and pays the person who did it through PayPal."
- Remove:
  - `<RiverWorld />` and the `hero-art-shape` element
  - both `hero-floating-card`s
  - `hero-scene-caption`
  - the scroll cue's "EXPLORE WHAT WE CAN DO TOGETHER" text (keep only the arrow, with `aria-label="Scroll to how it works"`)
- **Nav over the hero.** `MarketingNav` is transparent with white text while the hero is in view, and switches to its current solid style after that. Use an `IntersectionObserver` on a sentinel at the bottom of the hero and toggle a `data-over-hero` attribute on the header. Do not use a scroll listener.
- **Remove the intro splash.** Delete `components/landing-welcome.tsx` and its CSS (`.landing-welcome`, `.welcome-*`). The river is now the first impression, and the splash hid it for 2.5 s.
- **Final CTA section** ("Help write the next one"): replace `<AbstractArt variant="ripple" />` with the same `poster` still (`next/image`, `object-fit: cover`) under the same scrim. One photographic language across the page.
- Delete `components/river-world.tsx` and its CSS in `landing.css` (`.river-world`, `.world-*`, `.hero-floating-*`, `.hero-art-shape`, `.hero-scene-caption`).
- Delete `public/images/river-dawn.webp` and its README. It is an AI-generated illustration referenced only from dead CSS (`globals.css:1345`).
- Leave the other landing sections as they are, apart from the copy items in §3.4.

### 1.5 Acceptance
- Desktop and mobile: the hero shows real moving water within about 1 s of idle, the text is readable, and there is no layout shift when the video replaces the poster.
- With reduced motion, or with DevTools Save-Data, only the still poster shows and no video request appears in the Network tab.
- The video pauses when scrolled out of view: CPU drops in the Performance panel.
- `npm run build && npm start`, then Lighthouse on `/` (mobile): LCP ≤ 2.5 s, CLS < 0.05.
- In light and dark theme the hero looks the same (it is a photo), and the rest of the page follows the theme.

---

## 2. Overview page (`/river`): river-themed, clean, focused

Goal: the first screen reads as "the state of this river right now", not a generic finance dashboard. Reuse existing data only; invent no metrics.

### 2.1 Naming
The nav says "Observatory" and the page H1 says "Overview". Use **"Overview"** in both places:
- `links` in `components/app-shell.tsx`
- `app/(app)/river/page.tsx`
- the footer link on the landing page
- `journeys.spec.ts` lines 14 and 62

Change the description to: "Live readings, signals, quests and treasury for the Yamuna, Delhi."

### 2.2 New first row: "River now" card (replaces three things)
Replace the `expedition-banner` (abstract SVG plus "Good things start with a small ripple"), the `River indicator` panel and the rail's `On the river` panel with **one wide card**:
- Background: the hero `poster` still, cropped wide, or a second still from the same footage, under a dark-left scrim. Optional: the same video loop with the same §1.3 rules. Default to the still on the dashboard so it stays calm.
- Overlaid, white:
  - "Yamuna · Delhi reach" label
  - the health score as a large number "64 / 100" with the trend badge, keeping the existing `<details>` "About this indicator" disclaimer
  - three inline stats: open quests (`open_bounties`), events in 24 h (`events_24h`), and the latest turbidity with unit, plus a "Simulated" badge when `latest.simulated`
- A single CTA: "View open quests" → `/bounties`.
- Data comes from `useRiver()` and the readings query only. The empty and loading states go through `AsyncView`, as today.
- Delete the now-unused `.expedition-banner*`, `.overview-score-*`, `.river-snapshot`, `.snapshot-*` CSS.

### 2.3 New: "River reach" strip (the river-themed element)
Add a slim panel under the River-now card. It is a schematic of the Delhi stretch as one gently curving horizontal SVG line (river-blue stroke with a soft bank band), labelled at the ends "Wazirabad (N)" and "Okhla (S)".
- Place markers for current events (waste or water icon, coloured by type) and open quests (pin) by projecting their `lat` onto the reach. Use about 28.71 at Wazirabad to 28.53 at Okhla, clamped. Both events and bounties already carry `lat` and `lon` (`lib/contracts.ts:132,190`).
- Markers are links to `/bounties/:id` or the atlas, keyboard-focusable, with a tooltip or `aria-label` (summary plus severity).
- Show the label "Schematic, not to scale". Link "Open full map" → `/atlas`.
- About 120 px tall. No animation, or at most a 2 s fade-in that respects reduced motion.
- Implement it as `components/river-reach.tsx` using the existing `useBounties()` plus the events query.

### 2.4 Rest of the page (keep, lightly tidied)
- Keep the four treasury metric cards. Use the same label set everywhere (§3.3).
- Water chart: retitle "The water, at a glance" → "Water readings", and use the river accent token for the line. Keep the table, the stale note and the simulated badge.
- **Verify a possible bug.** In the 1440 px screenshot, "Signals over time" showed only the skeleton bars, while the "Every dollar" chart had rendered. Check whether `ActivityChart` loads at all in mock mode, or whether the screenshot was just early.
  - Keep the heading text: the tests assert it.
- **Quest cards.** Drop the `AbstractArt` cover (three cartoon blobs in a row). The card becomes: status badge and urgency on top, then title, area, and reward with the arrow. This matches the `/bounties` card style minus the art.
  - Retitle "Find your next good thing" → "Open quests".
- **Rail.** "Latest signals", "Quest activity" and "River diary" stay.
- "The payout trail" → "Payouts".

### 2.5 Acceptance
- The first screen at 1440×900 shows the River-now card with real numbers, the reach strip and the metric row, with no decorative SVG blobs.
- 390 px mobile: the cards stack and the reach strip scrolls horizontally or scales, with no overflow.
- The figures match the old page's figures: same API, same numbers.

---

## 3. Professional cleanup (minimal; fix real issues, don't restyle)

### 3.1 Bugs and correctness (do all of these)
1. **Theme flash on load.** `app/layout.tsx` hard-codes `className="dark"`, while `theme-toggle.tsx` fixes the theme in an effect. Add a tiny inline `<script>` in `<head>` that reads `localStorage["rivermind:theme"]` (falling back to `prefers-color-scheme`) and sets both `classList.dark` and `dataset.theme` before paint. Add `suppressHydrationWarning` on `<html>`.
2. **Wrong after-photo error.** `worker-journey.tsx:128-131` says "before photo" for both kinds of photo. Choose the message by `kind`.
3. **Ignored save result.** `worker-journey.tsx:259-264`: handle a failed `saveClaim` the same way as lines 65-69.
4. **Duplicated queries.** Add `useReadings()` and `useEvents()` to `lib/queries.ts`, keeping the same keys and `refetchInterval: 5_000`. Use them in `river/page.tsx`, `atlas/page.tsx` and `landing-data.tsx`.
5. `atlas/page.tsx:21`: rename the dynamic import `Map` → `RiverMap` (it shadows the global).
6. `atlas/page.tsx:79`: add `role="group"` to the segmented control.
7. `council/page.tsx:108-113`: move focus to `#council-reason` when the confirm panel opens.
8. **Per-route `<title>`.** Add a small server `layout.tsx` with `metadata.title` in each route folder (river, atlas, bounties, donate, about, council), because the pages are `"use client"`.
9. `shared.tsx`: give `Skeleton` a `label` prop (default "Loading…"). `Notice` uses `role="alert"` for the error variant. `Button` defaults to `type="button"`.
10. `dashboard-analytics.tsx`: add `scope="col"` on the `th` elements, and an `aria-label` on the data tables.

### 3.2 Dead code (delete only after grepping; it is safe and shrinks the bundle)
- `components/reveal.tsx`. After deleting it, check whether `motion` is still imported anywhere; if not, remove the dependency.
- In `components/landing-data.tsx`, the exports `HeroRiverNote`, `FeaturedQuest` and `LandingWayfinder`, plus any imports only they used.
- `components/ui/animated-theme-toggler.tsx`: remove the uncontrolled branch that writes the `"theme"` key.
- **About 1,500 dead CSS lines** (from the CSS audit). Delete them in their own commit, and compare before/after screenshots of every route in both themes:
  - `globals.css` 502-1745, the old `.landing …` / `.marketing-nav*` landing. The page root is `.landing-experience`, so `.landing` never matches. **Keep** these blocks inside that range: atlas-preview*, observatory-preview, preview-*, treasury-receipt/receipt-*, landing-stat(s), stats-*, river-diary/diary-*, faq-list/faq-plus, eyebrow-line, skeleton-stack. Drop `featured-quest*`, `hero-river-note*` and `wayfinder*` too, once §3.2's TSX deletions are done.
  - `globals.css`: the responsive blocks that only style those dead classes (about 2323-2394, 2441-2592, 2655-3065), plus `topbar-location`, `dashboard-grid`, `health-*`, `freshness`, `compact-quest*` and `sensor-metrics`.
  - `globals.css` 157-161: `--ink` and `--paper`, which are unused.
  - `dashboard.css` 1524-1722: the whole `.landing` / `html[data-theme=light] .landing` block.
  - `landing.css`: `.world-marker.marker-focused` (it goes with river-world anyway).
- **Do NOT** attempt the bigger token unification (the two palettes in `globals.css` and `dashboard.css`). It is the right long-term fix but too risky two days before the deadline. Note it as follow-up.

### 3.3 Consistency (small, visible wins)
- **PageHeading eyebrow.** Drop "Chapter 02/03/04 / …". Use a one-word section label equal to the nav name:
  - Overview, Atlas, Quests, Treasury, Reports, About, Council
- **One noun in the UI: "quest"** (the route stays `/bounties`).
  - "quest journal" → "quests"
  - "field journal" → "quest"
  - "Back to the quest journal" → "Back to quests"
- **One set of treasury labels**, used on Overview, Donate and the landing preview:
  - Available
  - Reserved for quests
  - Paid out
  - Donations
- **Mode label.** Add a `modeLabel(kind)` helper in `lib/format.ts`. Use it for the eight "Simulated demo reward / PayPal sandbox reward" ternaries so the wording is identical everywhere.
- **Plain empty states:**
  - "A quiet stretch for now." → "Nothing here yet."
  - "Every open quest has found a guardian." → "No open quests right now."
  - "The first payout is still ahead." → "No payouts yet."
  - "The first contribution could be yours." → "No donations yet."
- **Footer slogan.** Keep "Every action leaves a trace." once (landing footer). In the app shell footer, use "RiverMind · PayPal AI Hackathon 2026 · Sandbox prototype".

### 3.4 Copy: tone down only the loudest lines (keep the voice, cut the fluff)
| Where | Now | Change to |
|---|---|---|
| `river/page.tsx` description | A little care. A real difference. … | Live readings, signals, quests and treasury for the Yamuna, Delhi. |
| `app-shell.tsx` sidebar chapter | River care, made collective. | Yamuna, Delhi |
| `app-shell.tsx` sidebar note | A LITTLE ACTION GOES A LONG WAY / Your next good thing starts here. | Open quests / Find a cleanup to claim. Also drop the `AbstractArt` inside the note. |
| `app-shell.tsx` topbar search | Find your next cleanup quest | Find a cleanup quest |
| `bounties/page.tsx` | badge "Real work. Clear purpose." + "Find your next cleanup. Capture the change. Follow your reward." | Remove the badge. "Browse open cleanups and track your claims." |
| landing `#story` heading | SMALL MISSIONS. SHARED PURPOSE. | HOW IT WORKS (keep the H2) |
| landing card titles | Find the right place. / Make care actionable. / Keep a trail of trust. | Detect pollution. / Post a funded quest. / Verify, then pay. |
| `not-found.tsx` | This stretch is uncharted. … | Page not found / The page doesn't exist or has moved. |
| `layout.tsx` metadata description | A river with a voice. A cleanup with proof. RiverMind connects… | Keep only the second sentence. |

**Leave these as they are**, because the tests depend on them and they read fine:
- Capture a change worth seeing.
- A little care, carried forward.
- Signals over time
- Every dollar, accounted for
- The cleanup checks passed.

### 3.5 Explicitly NOT doing
- No palette or token rewrite, no Tailwind migration of the hand CSS, no component splitting of `worker-journey.tsx` / `reports-workspace.tsx`, and no `MetricCard` abstraction.
- No change to atlas, reports, donate or council layouts beyond §3.1-3.4.
- `AbstractArt` on `/bounties` cards stays for now. Revisit only if time allows: a mini map crop per quest would be the honest replacement.

---

## 4. Integration notes (P1)
- The UI already renders verification reasons, the diary and the event summaries from the API. When `ai/` lands and the backend flips `USE_MOCK_AI=false`, nothing in this plan needs to change.
- After the merge: run `make test`, then `make smoke` against the deployed API, with `NEXT_PUBLIC_USE_MOCK=false`.

## 5. Order of work and verification
1. Branch, run `npm run lint && npm run typecheck && npm test && npm run test:browser` once, and record the baseline.
2. Take baseline screenshots. There is a Playwright script from planning that shoots 8 routes at 1440 and 390 px in both themes; re-create it in `frontend/scripts/` or the scratchpad.
3. §3.1 bugs → §3.2 dead TSX → §1 hero → §2 overview → §3.3/3.4 copy → §3.2 dead CSS (last, as its own commit).
4. After each step, run lint, typecheck and unit tests. After steps 3 and 4, also run `test:browser` and the screenshots.
5. Final: production build, Lighthouse on `/` and `/river`, a reduced-motion pass, keyboard pass (Tab through the hero, nav, reach markers and council confirm), and zero console errors.
6. Open a PR to `main` with before/after screenshots and the credit and licence note for the footage.

Commit style: `feat(fe): real river hero [landing]`, `feat(fe): river-now card + reach strip [overview]`, `fix(fe): theme flash, photo error copy`, `chore(fe): remove dead CSS and components`.
