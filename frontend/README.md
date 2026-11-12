# RiverMind frontend

RiverMind’s shared interface: a public landing page, a responsive observatory workspace, and a complete fixture-backed cleanup journey. Readings, verification, and PayPal payments are labelled simulated when local demo mode is enabled.

## Interface design

The application uses a clean card dashboard with an expandable icon rail and a river activity panel. The rail starts compact, retains its state between workspace routes, and expands from the top-bar control. Light mode uses white and cool-gray surfaces; dark mode uses charcoal surfaces. The saved theme is applied before first paint.

`app/dashboard.css` owns the shared dashboard palette and component styles for both themes. The landing page shares those tokens through `app/landing.css`.

The landing hero plays river footage (`components/river-hero-media.tsx`): a poster still loads first, and a muted loop starts once the page is idle. The loop pauses off-screen and is skipped for reduced-motion and data-saver visitors. A short blurred welcome appears on landing-page reloads, and illustrated phone previews explain the cleanup workflow.

The protected overview uses the standard workspace background and a compact desktop viewport layout. Its charts grow with their panels; longer records scroll inside their panels. The top bar stays fixed, and mobile layouts stack normally. The treasury ring supports pointer and keyboard selection and defaults to its largest allocation. Workspace placeholders follow the current route's sections.

Quest search is debounced by 200 ms and renders six cards per page; payout ledgers render ten rows per page. Query results remain fresh for 15 seconds and cached in memory for 15 minutes; active monitoring still polls every five seconds. Charts load lazily and reuse sorted reading data. Notifications cover authentication and submitted actions without announcing background polling.

Display amounts use approximate INR at a dated ECB reference of ₹94.05/USD on 12 Nov 2026, verified through [Frankfurter's ECB endpoint](https://api.frankfurter.dev/v2/providers/ecb/rate/usd/inr). The reference is bundled, so no exchange-rate network request delays the interface. Checkout, approval amounts, API requests and CSV source amounts remain USD cents. `lib/currency.ts` records the rate, date and disclosure. The print action creates a dedicated A4 report with scope, executive summary, water statistics, current status breakdowns, source values and methodology.

The footage is illustrative stock footage of a river, not the Yamuna, and is labelled so in the interface. Source and licence are in `public/hero/CREDITS.md`; that media is not covered by the repository's MIT licence. `components/abstract-art.tsx` contains decorative SVG artwork for quest cards; neither is monitoring imagery or cleanup evidence.

## Local setup

Use Node.js 20.19+ (Node 22 recommended). From this directory:

```sh
npm install --cache .npm-cache
npm run dev
```

Open http://localhost:3000. Fixture JSON is copied from the shared repository fixtures into the ignored `public/fixtures/` folder before development and production builds. Shared fixtures are never edited by the frontend.

For the interactive demo, use:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_USE_MOCK=true
NEXT_PUBLIC_PAYPAL_CLIENT_ID=
```

The API adapter uses the fixture-backed workflow in demo mode: claims survive a refresh in browser session storage, proof bytes drive the deterministic demo verification result, donations are idempotent, and council actions require the key kept in React memory. No credentials or raw sandbox PayPal email are persisted.

For backend integration, set `NEXT_PUBLIC_USE_MOCK=false`. The API URL is an origin only, without `/api/v1`; the adapter appends the API prefix. Omitting the mock flag selects the API, never an automatic fixture fallback. The PayPal client ID is public; no council key, device token, or PayPal secret belongs in a `NEXT_PUBLIC_` setting. Fonts are bundled locally rather than fetched at build or page-render time.

## Routes

- `/` — public landing page with a river-footage hero, live snapshot, how it works, atlas and readings previews, featured quest, treasury, diary, FAQ, and final CTA.
- `/river` — overview dashboard with real API/demo readings, events, quests, treasury, staleness labels, and payout ledger.
- `/reports` — monthly available-record summaries, daily signal charts, water statistics, CSV download, and Print / Save as PDF.
- `/atlas` — accessible Leaflet map with real event/quest coordinates and a keyboard-friendly location list.
- `/bounties` and `/bounties/[id]` — quest journal, filters, claim flow, proof capture, verification result, and payment/review state.
- `/donate` — exact-cent donation form, fixture/PayPal sandbox labelling, contributions, treasury, and ledger.
- `/council/sign-in` and `/council` — in-memory council key entry and review actions for eligible claims.
- `/about` — process, architecture roles, metric glossary, and prototype limits.

## Commands

| Command                | Purpose                                                   |
| ---------------------- | --------------------------------------------------------- |
| `npm run dev`          | Copy fixtures and start local development                 |
| `npm run build`        | Copy fixtures and create a production build               |
| `npm start`            | Serve a production build                                  |
| `npm run lint`         | ESLint, with zero warnings allowed                        |
| `npm run typecheck`    | Strict TypeScript checking                                |
| `npm test`             | Contract fixtures, API transport, and mock workflow tests |
| `npm run test:browser` | Playwright journeys at desktop and mobile widths          |
| `npm run format:check` | Check formatting without modifying files                  |
| `npm run gen:types`    | Generate types from the supplied OpenAPI file             |

The Stage 1 backend integration tests are opt-in and use an isolated SQLite database:

```sh
RIVERMIND_TEST_BACKEND=true npx --no-install vitest run tests/backend.integration.test.ts
```

The development and build scripts use Next.js's supported Webpack compiler. Turbopack's PostCSS worker could not bind its internal port in this execution environment. ESLint is pinned to 9.39.5 to satisfy the declared peer dependencies of Next.js's lint plugins.

## Boundaries and limitations

Reports filter the currently returned records by IST month. They are partial summaries, not an archive: the contract exposes recent readings (up to 200), events (up to 50), donations (up to 20), and available quests and payouts. Quest and payout statuses are current, with records grouped by creation date. A successful payout in this cohort does not establish that payment completed in the selected month. These limits and simulation labels appear in the preview, CSV, and printable report. CSV amounts remain integer USD cents; exports omit names, email addresses, and private tokens. No backend report endpoint or historical health trend is assumed.

- `lib/api.ts` is the API entry point. It validates responses, normalizes errors, supports cancellation, uses 20-second ordinary and 60-second AI deadlines, and never retries mutations automatically.
- Generated `openapi.json` and `lib/api-types.ts` come from `make types`; never hand-edit them. Runtime validators in `lib/contracts.ts` mirror those types.
- Money is integer cents in the contract. Backend rules decide reward amounts; the frontend only displays them and sends user input through validation.
- The hero footage is illustrative stock footage, not monitoring data or cleanup evidence. See `public/hero/CREDITS.md`.
- The frontend does not invent accounts, monitoring stations, XP, achievements, safety indices, or live AI/payment results that the backend does not provide.

Git branch management, commits, pushes, merges, and PRs are handled by the user.
