# RiverMind frontend

RiverMind’s shared interface: a public landing page, a responsive observatory workspace, and a complete fixture-backed cleanup journey. Readings, verification, and PayPal payments are labelled simulated when local demo mode is enabled.

## Interface design

The application uses a clean card dashboard with an expandable icon rail, a river activity panel, and original abstract quest artwork. The rail starts compact, retains its state between workspace routes, and expands from the top-bar control. Active navigation uses the tile itself, with no status dot. Light mode uses white and cool-gray surfaces; dark mode uses charcoal surfaces.

`app/dashboard.css` owns the shared dashboard palette and component styles for both themes. `components/abstract-art.tsx` contains decorative SVG artwork; these illustrations are not monitoring imagery or cleanup evidence. The Magic UI theme switch remembers the selected mode in browser storage and respects reduced-motion preferences.

The landing page shares those tokens through `app/landing.css`, with a static illustrated river in the hero, concise project explanations, workspace previews, and a real API/demo quest. It has no pinned scroll story or chapter sequence. The shared accent palette uses river blue, aqua, leafy green, and a little warm sand.

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

- `/` — ten-section public landing page with expedition story, atlas and observatory previews, workflow, featured quest, treasury, diary, FAQ, and final CTA.
- `/river` — observatory dashboard with real API/demo readings, events, quests, treasury, staleness labels, and payout ledger.
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
- The hero artwork is an original decorative illustration, not monitoring data or cleanup evidence. See `public/images/README.md` for attribution and the generation prompt.
- The frontend does not invent accounts, monitoring stations, XP, achievements, safety indices, or live AI/payment results that the backend does not provide.

Git branch management, commits, pushes, merges, and PRs are handled by the user.
