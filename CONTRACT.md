# CONTRACT v2.0 — RiverMind
Owner: Dhruv (Integration lead). Changed only through a CONTRACT CHANGE REQUEST.
Issued: Mon 9 Nov 2026, IST. Adding an optional field = v1.1. Renaming, removing, or changing a field's type/unit/meaning = v2.0 and every consumer is updated in the same merge.

## Conventions
- Base URL: `NEXT_PUBLIC_API_URL` (frontend) and `API_URL` (scripts) are the backend ORIGIN only, with no path (e.g. `http://localhost:8000`). Clients append `/api/v1/...`. OpenAPI stays at `{origin}/openapi.json` (the FastAPI default). JSON, UTF-8.
- FastAPI's default handlers (422 validation, 404/405, unhandled exceptions) are overridden so every error uses the shape below — never `{"detail": ...}`.
- Times: ISO 8601 UTC strings (`2026-11-10T07:30:00Z`). IDs: UUID strings (readings use integer `seq` per device).
- Money: integer cents in fields named `*_cents`, plus `"currency": "USD"`. Only `backend/app/adapters/paypal_client.py` turns cents into PayPal's `"12.50"` strings.
- Units: turbidity `ntu`, TDS `ppm`, temperature `c`, distance `m`. Coordinates: WGS84 decimal degrees.
- Unknown request fields are rejected (`VALIDATION_ERROR`). Max JSON body 64 KB; max image upload 8 MB (jpeg/png only, checked by content).
- Auth:
  - Device: header `X-Device-Token` (stored hashed).
  - User session: header `Authorization: Bearer st_...` (token returned by register and login, valid 7 days; only its sha256 is stored). Needed to claim a bounty, submit proof and create a donation order.
  - Worker: header `X-Claim-Token` (returned once by the claim endpoint). Proof needs both the user session and the claim token.
  - Council: header `Authorization: Bearer <COUNCIL_API_KEY>`, OR a user session whose user has role `council`. A worker session gets FORBIDDEN (403); a missing, bad or expired token gets UNAUTHORIZED (401).
  - Everything else is public read.
- Accounts: `POST /auth/register` always creates a `worker`; the role can never be set by the client. Council users are created only by the seed from env `COUNCIL_EMAIL` + `COUNCIL_PASSWORD` (set both; run `python -m app.seed` or `POST /demo/reset`). Reset keeps accounts and sessions. Passwords are stored as salted scrypt hashes. Register and login are rate-limited to 10/min/IP.
- Idempotency: header `Idempotency-Key` (UUID) is REQUIRED on endpoints marked (IK). A repeat with the same key returns the stored response.
- Backend timeouts: AI calls 25 s; PayPal calls 15 s.

## Error shape (every endpoint, every non-2xx)
```json
{"error": {"code": "INVALID_STATE", "message": "Bounty is not OPEN", "details": {}}}
```
| code | HTTP |
|---|---|
| VALIDATION_ERROR | 422 |
| UNAUTHORIZED | 401 |
| FORBIDDEN | 403 |
| NOT_FOUND | 404 |
| INVALID_STATE | 409 |
| IDEMPOTENCY_CONFLICT | 409 |
| PAYLOAD_TOO_LARGE | 413 |
| BUDGET_EXCEEDED | 422 |
| RATE_LIMITED | 429 |
| INTERNAL | 500 |
| PAYPAL_ERROR | 502 |
| AI_UNAVAILABLE | 503 |

## Shared objects
**Bounty**
```json
{"id":"uuid","event_id":"uuid","title":"Plastic build-up at Kalindi Kunj ghat","description":"string",
 "amount_cents":1500,"currency":"USD",
 "status":"OPEN|CLAIMED|PROOF_SUBMITTED|VERIFIED|REJECTED|PAYOUT_PENDING_APPROVAL|PAID|PAYOUT_FAILED",
 "lat":28.5355,"lon":77.3100,"radius_m":150,"expires_at":"iso|null","urgency":"low|med|high",
 "agent_rationale":"string","worker_name":"string|null","claimed_at":"iso|null",
 "rejection_reason":"string|null","verification":"Verification|null","payout":"Payout|null",
 "created_at":"iso","updated_at":"iso"}
```
**Verification** (`passed` is computed by backend code, never by the AI)
```json
{"id":"uuid","bounty_id":"uuid","passed":true,"score":0.86,
 "checks":{
   "geo":{"passed":true,"distance_m":42.0,"source":"browser|exif|none"},
   "time":{"passed":true},
   "duplicate":{"passed":true,"nearest_hamming":23},
   "scene_match":{"passed":true,"inliers":61},
   "count_drop":{"passed":true,"before_count":14,"after_count":2},
   "llm":{"passed":true,"vote":0.9,"notes":"Same ghat steps; floating bottles removed"},
   "manipulation":{"flagged":false},
   "sensor":{"passed":null,"turbidity_delta":null}},
 "reasons":["string"],"explanation":"string","model_version":"string","created_at":"iso"}
```
**Payout**
```json
{"id":"uuid","bounty_id":"uuid","amount_cents":1500,"currency":"USD",
 "status":"PENDING_APPROVAL|QUEUED|SENDING|SENT|SUCCEEDED|FAILED|VETOED",
 "receiver_masked":"wo***@example.com","paypal_batch_id":"string|null","paypal_item_id":"string|null",
 "created_at":"iso","updated_at":"iso"}
```
**Detection**
```json
{"waste_detected":true,"waste_score":0.78,
 "counts":{"bottle":6,"bag":3,"foam":1,"other":4},
 "boxes":[{"xyxy":[0.12,0.40,0.18,0.47],"cls":"bottle","conf":0.81}],
 "foam_ratio":0.07,"summary":"Floating bottles and bags near the steps","confidence":0.8,
 "model_version":"yolo11n-rivermind-v1|mock-1"}
```
`xyxy` values are normalised 0–1 relative to the image.

## Endpoints (all under /api/v1)
| # | Method + path | Auth | Owner → used by |
|---|---|---|---|
| 1 | GET /health | none | BE → all |
| 23 | POST /auth/register | none (rate-limited 10/min/IP) | BE → FE |
| 24 | POST /auth/login | none (rate-limited 10/min/IP) | BE → FE |
| 25 | POST /auth/logout | session | BE → FE |
| 26 | GET /auth/me | session | BE → FE |
| 2 | POST /readings | device | BE → firmware, sim |
| 3 | GET /readings?device_id=&limit=200 | none | BE → FE |
| 4 | POST /media/analyze | none (rate-limited 20/min/IP) | BE → camera node, FE |
| 5 | GET /media/{id} | none | BE → FE (image bytes, EXIF stripped) |
| 6 | GET /events?type=&limit=50 | none | BE → FE |
| 7 | GET /bounties?status= | none | BE → FE |
| 8 | GET /bounties/{id} | none | BE → FE |
| 9 | POST /bounties/{id}/claim | session | BE → FE |
| 10 | POST /bounties/{id}/proof | session + claim | BE → FE |
| 11 | GET /payouts?status= | none | BE → FE |
| 12 | POST /payouts/{id}/approve (IK) | council (key or council session) | BE → FE |
| 13 | POST /payouts/{id}/veto | council (key or council session) | BE → FE |
| 14 | POST /payouts/{id}/retry (IK) | council (key or council session) | BE → FE |
| 15 | POST /donations/orders (IK) | session | BE → FE (PayPal Buttons createOrder) |
| 16 | POST /donations/orders/{order_id}/capture | none | BE → FE (PayPal Buttons onApprove) |
| 17 | GET /donations?limit=20 | none | BE → FE |
| 18 | GET /river/status | none | BE → FE |
| 19 | GET /diary/latest | none | BE → FE |
| 20 | POST /webhooks/paypal | PayPal signature | PayPal → BE |
| 21 | POST /agent/fundraise (P1) | council (key or council session) | BE → FE |
| 22 | POST /demo/reset | council (key or council session) | BE → scripts |

### 23–26. Auth
`user` = `{"id":"uuid","name":"string","email":"string","role":"worker|council"}`. Emails are stored lowercased.
- 23 register: request `{"name":"1-80 chars","email":"string","password":"8-128 chars"}` → 201 `{"user":User,"token":"st_..."}`. Duplicate email: VALIDATION_ERROR, message "An account with this email already exists". Unknown fields (such as `role`) are rejected.
- 24 login: request `{"email":"string","password":"string"}` → 200 `{"user":User,"token":"st_..."}`. Wrong email or password: UNAUTHORIZED "Invalid email or password" (the same answer for both).
- 25 logout: revokes the session in the `Authorization` header → 204, no body.
- 26 me: → 200 `{"user":User}`. Missing, unknown, revoked or expired token: UNAUTHORIZED "Sign in required".

Errors: VALIDATION_ERROR, UNAUTHORIZED, RATE_LIMITED. Endpoints 9, 10 and 15 also return UNAUTHORIZED ("Sign in required") without a valid session. Reads, device ingest, the PayPal webhook and donation capture stay public.

### 1. GET /health
200: `{"status":"ok","version":"1.0","mock_ai":true,"paypal_mode":"mock|sandbox","db":"ok"}`

### 2. POST /readings
Request: `{"device_id":"yamuna-okhla-01","seq":1042,"ts":"iso","lat":28.5355,"lon":77.3100,"turbidity_ntu":38.2,"ph":7.4,"tds_ppm":612.0,"temp_c":24.1,"simulated":false}`
200: `{"reading_id":"uuid","duplicate":false,"event_id":"uuid|null","bounty_id":"uuid|null"}`
The same `device_id`+`seq` again returns 200 with `"duplicate":true` and writes nothing.
Errors: UNAUTHORIZED, VALIDATION_ERROR.

### 3. GET /readings?device_id=&limit=200
200: `{"items":[{"seq":1042,"ts":"iso","turbidity_ntu":38.2,"ph":7.4,"tds_ppm":612.0,"temp_c":24.1,"simulated":false}]}` (newest first)

### 4. POST /media/analyze
multipart/form-data:
- `file` (jpeg/png, max 8 MB), required
- `lat`, `lon`, optional floats
- `captured_at`, optional ISO string
- `source`, `camera|upload`, default `upload`

200: `{"media_id":"uuid","analysis":Detection,"event_id":"uuid|null","bounty_id":"uuid|null"}`
- When `source=camera`, `lat` and `lon` are REQUIRED (the camera node sends the rig's real coordinates from env CAMERA_LAT/CAMERA_LON).
- A WASTE event is created when `waste_score >= 0.5`. Event severity is set by the backend: WASTE = clamp(ceil(5 × waste_score), 1, 5); SENSOR_ANOMALY = clamp(ceil(5 × AnomalyResult.score), 1, 5), where score is 0–1. `propose_bounty` uses `EventCtx.severity` as given.
- A bounty is created only if the agent proposes one AND the budget rules pass AND there is no open bounty within 500 m created in the last 6 h. "Open bounty" = status OPEN, CLAIMED or PROOF_SUBMITTED.

Errors: PAYLOAD_TOO_LARGE, VALIDATION_ERROR, AI_UNAVAILABLE.

### 6. GET /events
200: `{"items":[{"id":"uuid","type":"WASTE|SENSOR_ANOMALY","severity":1,"waste_score":0.78,"summary":"string","lat":0,"lon":0,"media_id":"uuid|null","bounty_id":"uuid|null","created_at":"iso"}]}`

### 7–8. GET /bounties, GET /bounties/{id}
7 → 200 `{"items":[Bounty]}`. 8 → 200 `Bounty`; NOT_FOUND.

### 9. POST /bounties/{id}/claim
Request: `{"worker_name":"Asha","paypal_email":"asha-personal@example.com"}`
200: `{"bounty":Bounty,"claim_token":"ct_..."}`. The token is shown once. Claims never expire: the bounty stays with that worker until proof is submitted.
Errors: NOT_FOUND; INVALID_STATE if not OPEN; VALIDATION_ERROR.

### 10. POST /bounties/{id}/proof
Header `X-Claim-Token`. multipart:
- `before`, `after`: jpeg/png
- `lat`, `lon`: browser geolocation at capture time, required
- `before_captured_at`, `after_captured_at`: ISO strings, required

200: `{"bounty":Bounty,"verification":Verification}`. The call is synchronous: mock under 1 s, real under 25 s.
Errors: UNAUTHORIZED, NOT_FOUND, INVALID_STATE, PAYLOAD_TOO_LARGE, AI_UNAVAILABLE.

### 11. GET /payouts
200: `{"items":[Payout],"totals":{"paid_cents":0,"pending_cents":0}}`

### 12–14. Council actions
- 12 approve: request `{"note":"optional"}` → 200 `{"payout":Payout}`
- 13 veto: request `{"reason":"string"}` → 200 `{"payout":Payout,"bounty":Bounty}`
- 14 retry: allowed only from FAILED → 200 `{"payout":Payout}`

Errors: UNAUTHORIZED, NOT_FOUND, INVALID_STATE, IDEMPOTENCY_CONFLICT, PAYPAL_ERROR.

### 15. POST /donations/orders (IK)
Request: `{"amount_cents":500,"donor_name":"optional, max 60 chars"}`. `amount_cents` must be 100–100000.
200: `{"donation_id":"uuid","order_id":"PAYPAL-ORDER-ID"}`
Errors: VALIDATION_ERROR, PAYPAL_ERROR.

### 16. POST /donations/orders/{order_id}/capture
200: `{"donation":{"id":"uuid","amount_cents":500,"currency":"USD","status":"CAPTURED","donor_name":"string|null","created_at":"iso"}}`
Capturing again returns the same result. Errors: NOT_FOUND, INVALID_STATE, PAYPAL_ERROR.

### 17. GET /donations
200: `{"items":[{"id":"uuid","donor_name":"string|null","amount_cents":500,"currency":"USD","created_at":"iso"}],"total_cents":0}`

### 18. GET /river/status
200:
```json
{"river":"Yamuna","city":"Delhi","health_score":64,"trend":"improving|stable|worsening",
 "latest_reading":{"seq":1,"ts":"iso","turbidity_ntu":0,"ph":0,"tds_ppm":0,"temp_c":0,"simulated":false},
 "open_bounties":2,"events_24h":5,
 "treasury":{"available_cents":0,"reserved_cents":0,"paid_cents":0,"donated_cents":0,"currency":"USD"},
 "updated_at":"iso"}
```
`latest_reading` may be null. `health_score` is 0–100.

### 19. GET /diary/latest
200: `{"id":"uuid","text":"I am the Yamuna...","mood":"hopeful|worried|grateful","model_version":"string","created_at":"iso"}`. NOT_FOUND if there is no entry yet.

### 20. POST /webhooks/paypal
- Verified with PayPal `POST /v1/notifications/verify-webhook-signature`. Verification is skipped only when `PAYPAL_MODE=mock`.
- Each event id is stored once; repeats return 200 and do nothing.
- Handled events: `PAYMENT.PAYOUTS-ITEM.SUCCEEDED|FAILED|BLOCKED|RETURNED|UNCLAIMED`, `PAYMENT.CAPTURE.COMPLETED`.

200: `{"received":true}`. 400 for a bad signature.

### 21. POST /agent/fundraise (P1 — PayPal Agent Toolkit)
Request: `{"sponsor_email":"csr-sponsor@example.com","reason":"optional"}`
- The agent drafts a sponsorship invoice capped by `MAX_INVOICE_CENTS`.
- The backend creates and sends it through `paypal-agent-toolkit` (sandbox).

200: `{"invoice_id":"string","amount_cents":10000,"status":"SENT","agent_rationale":"string"}`
Errors: UNAUTHORIZED, BUDGET_EXCEEDED, PAYPAL_ERROR.

### 22. POST /demo/reset
Wipes demo tables and re-seeds:
- device `DEVICE_ID` (default `yamuna-okhla-01`) with sha256(`DEVICE_TOKEN`)
- the seed treasury ledger entry
- 2 sample events and 1 open bounty, placed at least 2 km from the device AND from CAMERA_LAT/CAMERA_LON, so they never block the demo bounty
- 1 diary entry

200: `{"reset":true}`

## Bounty state machine (backend `services/bounty_fsm.py`, one `transition()` function)
| from | event | to |
|---|---|---|
| OPEN | claim | CLAIMED |
| CLAIMED | proof with a valid token | PROOF_SUBMITTED |
| PROOF_SUBMITTED | policy pass | VERIFIED |
| PROOF_SUBMITTED | policy fail | REJECTED (reserve released) |
| VERIFIED | amount > COUNCIL_THRESHOLD_CENTS | PAYOUT_PENDING_APPROVAL |
| VERIFIED or PAYOUT_PENDING_APPROVAL (approved) | PayPal item SUCCESS | PAID |
| VERIFIED or PAYOUT_PENDING_APPROVAL | send or item failed | PAYOUT_FAILED |
| PAYOUT_PENDING_APPROVAL | veto | REJECTED (`COUNCIL_VETO`, reserve released) |
| PAYOUT_FAILED | council retry | VERIFIED → send path (attempt+1) |

- REJECTED and PAID are terminal.
- Each transition runs `UPDATE ... WHERE id=:id AND status=:expected AND version=:v`. If 0 rows change, the API returns INVALID_STATE.

## Verification policy (backend `services/verify_policy.py`)
Who computes what:
- **AI (`verify_cleanup`)** sets each per-check `passed` from fixed thresholds:
  - `scene_match`: ORB inliers ≥ 25
  - `count_drop`: before_count ≥ 1 AND after_count ≤ 0.4 × before_count, where count = bottle + bag + other
  - `llm`: vote ≥ 0.6
  - `manipulation`: `flagged` when the vision model sees editing or a screen photo
- **Backend** computes `geo`, `time` and `duplicate` itself:
  - `geo`: distance from the bounty ≤ `radius_m` + 150 m, using browser lat/lon
  - `time`: claimed_at ≤ before < after (no upper time limit)
  - `duplicate`: Hamming(before, after) ≥ 3 AND Hamming(before or after, every earlier PROOF image) ≥ 6. Camera frames are not compared.
- **Backend only** computes the overall result:
  - overall `passed` = geo AND time AND duplicate AND scene_match AND count_drop AND llm AND NOT manipulation.flagged
  - `score` = round(mean(llm.vote, min(1, inliers/50), 1 − after/max(before, 1)), 2), for display only
- `sensor` is shown as context only and never decides.
- Thresholds change only through a contract update, after P2's eval.

## Budget rules (backend `services/budget.py`; env, cents)
- Env: `MIN_BOUNTY_CENTS=500`, `MAX_BOUNTY_CENTS=5000`, `DAILY_CAP_CENTS=20000`, `SEED_TREASURY_CENTS=50000`, `COUNCIL_THRESHOLD_CENTS=2000`, `MAX_INVOICE_CENTS=50000`.
- available = seed + captured donations − reserved − paid.
- The agent's proposed amount is clamped to [MIN, MAX]. It is rejected with BUDGET_EXCEEDED if it is over `available` or would pass `DAILY_CAP`.

## Payout safety
- One payout per bounty (`payouts.bounty_id` UNIQUE).
- `sender_batch_id = "rm-{payout_id}-a{attempt}"` is UNIQUE and is also sent as the `PayPal-Request-Id` header.
- QUEUED → SENDING is a compare-and-set committed BEFORE the HTTP call. Only the request that wins it calls PayPal.
- After sending, poll `GET /v1/payments/payouts/{batch_id}` 3 times, 2 s apart. If the item is still not final, `GET /payouts` and `GET /bounties/{id}` re-poll SENT payouts older than 15 s (at most once per 15 s each). Webhooks (P1 feature) confirm as well.
- Item status mapping: SUCCESS → payout SUCCEEDED, bounty PAID. UNCLAIMED, RETURNED, BLOCKED or FAILED → payout FAILED, bounty PAYOUT_FAILED (council may retry). PENDING or ONHOLD → stay SENT.
- Workers must claim with a PayPal SANDBOX personal account email; any other address ends UNCLAIMED.
- `PAYPAL_MODE=mock`: the mock client returns SUCCESS immediately, so mock journeys reach PAID at once.

## AI adapter (backend → ai/, Python package `rivermind_ai`)
Layout:
- `ai/pyproject.toml`
- `ai/rivermind_ai/{__init__,schemas,interface,errors,factory,mock}.py`
- `ai/rivermind_ai/real/`
- `ai/rivermind_ai/models/`: the shipped ONNX, at most 25 MB, committed as package data
- `ai/tests/`
- `ai/tools/`: laptop-only scripts, not packaged

Dependencies:
- Base: pydantic>=2, numpy, Pillow, imagehash. The mock needs only these.
- Extra `[real]`: opencv-python-headless, onnxruntime, scikit-learn and the LLM SDKs.
- The backend and Render install `-e "ai[real]"`.

`ai/` imports nothing from `backend/`. All models live in `rivermind_ai/schemas.py` (pydantic v2, `extra="forbid"`).
Detection classes: `bottle`, `bag`, `other`. Vegetation is detected but dropped from counts and boxes. `counts.foam` = 1 if foam_ratio > 0.05, else 0.
```python
# rivermind_ai/interface.py
class RiverAI(Protocol):
    def analyze_media(self, data: bytes, mime: str, meta: MediaMeta) -> Detection: ...
    def detect_sensor_anomaly(self, reading: SensorReading, history: list[SensorReading]) -> AnomalyResult: ...
    def propose_bounty(self, event: EventCtx, budget: BudgetCtx) -> BountyProposal: ...
    def verify_cleanup(self, before: bytes, after: bytes, ctx: VerifyCtx) -> VerificationScores: ...
    def phash(self, data: bytes) -> str: ...            # 16 hex chars
    def write_diary(self, status: RiverStatusCtx, recent: list[EventCtx]) -> DiaryEntry: ...
    def draft_invoice(self, status: RiverStatusCtx, sponsor_email: str, max_cents: int) -> InvoiceDraft: ...  # P1

# rivermind_ai/factory.py
def get_river_ai(use_mock: bool) -> RiverAI
```
Raises: `AIUnavailable` (provider down or timed out) and `InvalidOutput` (schema failed after one retry). The backend maps both to AI_UNAVAILABLE.
- `MediaMeta{lat?,lon?,captured_at?,source}`
- `SensorReading{ts,turbidity_ntu,ph,tds_ppm,temp_c}`
- `AnomalyResult{anomaly,score,sensor?,reason,method}`
- `EventCtx{event_id,type,severity,waste_score,summary,lat,lon,created_at}`
- `BudgetCtx{available_cents,min_cents,max_cents,daily_cap_cents,spent_today_cents}`
- `BountyProposal{post,title,description,amount_cents,radius_m,urgency,rationale,model_version}`
- `VerifyCtx{bounty_id,prior_phashes:list[str]}`
- `VerificationScores{scene_match{passed,inliers},count_drop{passed,before_count,after_count},llm{passed,vote,notes},manipulation{flagged},before_phash,after_phash,explanation,model_version}`. The AI fills each per-check `passed` using the thresholds in "Verification policy"; it never returns the overall decision.
- `RiverStatusCtx{health_score,trend,open_bounties,paid_cents,donated_cents,events_7d,cleanups_7d}`
- `DiaryEntry{text,mood,numbers_validated,model_version}`
- `InvoiceDraft{amount_cents,description,rationale}`

The backend computes the `geo`, `time` and `duplicate` checks itself. The AI never decides money.

## Device messages (ESP32 and simulator)
`POST /api/v1/readings` with `X-Device-Token`, the body as in endpoint 2, every 10 s, `seq` increasing. Simulated readings set `"simulated": true`. The dashboard labels them "simulated".

## Fixtures (`fixtures/`, exact contract shapes, realistic Yamuna values)
- `health.ok.json`
- `readings.ok.json`, `readings.empty.json`
- `media_analyze.ok.json`, `media_analyze.clean.json` (no waste: event_id null), `media_analyze.error.json`
- `events.ok.json`, `events.empty.json`
- `bounties.ok.json`, `bounties.empty.json`
- `bounty.open.json`, `bounty.paid.json`, `bounty.rejected.json`
- `claim.ok.json`, `claim.error.json`
- `proof.verified.json`, `proof.rejected_duplicate.json`
- `payouts.ok.json`, `payouts.empty.json`
- `donation_order.ok.json`, `donation_capture.ok.json`, `donations.ok.json`
- `river_status.ok.json`
- `diary.ok.json`, `diary.error.json`
- `payouts.ok.json` holds one PENDING_APPROVAL, one FAILED and one SUCCEEDED item
- `payout_approve.ok.json`, `payout_veto.ok.json`, `payout_retry.ok.json`, `fundraise.ok.json`, `demo_reset.ok.json`
- Errors: `error.validation.json`, `error.unauthorized.json`, `error.not_found.json`, `error.invalid_state.json`, `error.rate_limited.json`, `error.budget_exceeded.json`, `error.ai_unavailable.json`, `error.paypal.json`
- Images (our own photos, each < 300 KB, no faces):
  - `images/waste.jpg`: the mock gives waste_score ≥ 0.5
  - `images/clean.jpg`: the mock gives < 0.5
  - `images/before.jpg` and `images/after.jpg`: same scene, waste removed, Hamming ≥ 3
- The frontend copies `fixtures/` into `frontend/public/fixtures/` at predev/prebuild (git-ignored there).

## Changelog
v1.0 Mon 9 Nov 2026 — initial.
v2.0 Tue 10 Nov 2026 — bounties and claims have no time limits (P3, Arnav). `Bounty.expires_at` is now `iso|null` and is `null` for bounties that never expire (frontend: show "no expiry"). Removed the CLAIMED → OPEN "claim older than 2 h" transition. `time` check is now claimed_at ≤ before < after. Backend: `backend/` on branch `arnav`, migration a1b2c3d4e5f6.
