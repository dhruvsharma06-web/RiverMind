/** Runtime response validators; public types come from generated backend OpenAPI. */
import type { components } from "./api-types";
import { z } from "zod";

const id = z.uuid();
const timestamp = z.iso.datetime();
const cents = z.number().int().nonnegative().safe();
const unit = z.number().min(0).max(1);
const currency = z.literal("USD");
const lat = z.number().min(-90).max(90);
const lon = z.number().min(-180).max(180);

export const errorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "INVALID_STATE",
  "IDEMPOTENCY_CONFLICT",
  "PAYLOAD_TOO_LARGE",
  "BUDGET_EXCEEDED",
  "RATE_LIMITED",
  "INTERNAL",
  "PAYPAL_ERROR",
  "AI_UNAVAILABLE",
]);
export const errorResponseSchema: z.ZodType<ErrorResponse> = z.strictObject({
  error: z.strictObject({
    code: errorCodeSchema,
    message: z.string(),
    details: z.record(z.string(), z.unknown()),
  }),
});
export type ErrorCode = components["schemas"]["ErrorBody"]["code"];
export type ErrorResponse = components["schemas"]["ErrorResponse"];

export const healthSchema: z.ZodType<Health> = z.strictObject({
  status: z.literal("ok"),
  version: z.string(),
  mock_ai: z.boolean(),
  paypal_mode: z.enum(["mock", "sandbox"]),
  db: z.literal("ok"),
});
export const readingSchema: z.ZodType<Reading> = z.strictObject({
  seq: z.number().int().nonnegative(),
  ts: timestamp,
  turbidity_ntu: z.number(),
  ph: z.number(),
  tds_ppm: z.number(),
  temp_c: z.number(),
  simulated: z.boolean(),
});
export const readingsSchema = z.strictObject({ items: z.array(readingSchema) });

export const verificationSchema: z.ZodType<Verification> = z.strictObject({
  id,
  bounty_id: id,
  passed: z.boolean(),
  score: unit,
  checks: z.strictObject({
    geo: z.strictObject({
      passed: z.boolean(),
      distance_m: z.number(),
      source: z.enum(["browser", "exif", "none"]),
    }),
    time: z.strictObject({ passed: z.boolean() }),
    duplicate: z.strictObject({
      passed: z.boolean(),
      nearest_hamming: z.number().int(),
    }),
    scene_match: z.strictObject({
      passed: z.boolean(),
      inliers: z.number().int(),
    }),
    count_drop: z.strictObject({
      passed: z.boolean(),
      before_count: z.number().int(),
      after_count: z.number().int(),
    }),
    llm: z.strictObject({ passed: z.boolean(), vote: unit, notes: z.string() }),
    manipulation: z.strictObject({ flagged: z.boolean() }),
    sensor: z.strictObject({
      passed: z.boolean().nullable(),
      turbidity_delta: z.number().nullable(),
    }),
  }),
  reasons: z.array(z.string()),
  explanation: z.string(),
  model_version: z.string(),
  created_at: timestamp,
});

export const payoutStatusSchema = z.enum([
  "PENDING_APPROVAL",
  "QUEUED",
  "SENDING",
  "SENT",
  "SUCCEEDED",
  "FAILED",
  "VETOED",
]);
export const payoutSchema: z.ZodType<Payout> = z.strictObject({
  id,
  bounty_id: id,
  amount_cents: cents,
  currency,
  status: payoutStatusSchema,
  receiver_masked: z.string(),
  paypal_batch_id: z.string().nullable(),
  paypal_item_id: z.string().nullable(),
  created_at: timestamp,
  updated_at: timestamp,
});
export const bountyStatusSchema = z.enum([
  "OPEN",
  "CLAIMED",
  "PROOF_SUBMITTED",
  "VERIFIED",
  "REJECTED",
  "PAYOUT_PENDING_APPROVAL",
  "PAID",
  "PAYOUT_FAILED",
]);
export const bountySchema: z.ZodType<Bounty> = z.strictObject({
  id,
  event_id: id,
  title: z.string(),
  description: z.string(),
  amount_cents: cents,
  currency,
  status: bountyStatusSchema,
  lat,
  lon,
  radius_m: z.number().int(),
  expires_at: timestamp.nullable(),
  urgency: z.enum(["low", "med", "high"]),
  agent_rationale: z.string(),
  worker_name: z.string().nullable(),
  claimed_at: timestamp.nullable(),
  rejection_reason: z.string().nullable(),
  verification: verificationSchema.nullable(),
  payout: payoutSchema.nullable(),
  created_at: timestamp,
  updated_at: timestamp,
});
export const bountiesSchema = z.strictObject({ items: z.array(bountySchema) });
export const claimSchema: z.ZodType<Claim> = z.strictObject({
  bounty: bountySchema,
  claim_token: z.string().min(1),
});
export const proofSchema: z.ZodType<Proof> = z.strictObject({
  bounty: bountySchema,
  verification: verificationSchema,
});

export const detectionSchema: z.ZodType<Detection> = z.strictObject({
  waste_detected: z.boolean(),
  waste_score: unit,
  counts: z.strictObject({
    bottle: z.number().int(),
    bag: z.number().int(),
    foam: z.number().int(),
    other: z.number().int(),
  }),
  boxes: z.array(
    z.strictObject({
      xyxy: z.tuple([unit, unit, unit, unit]),
      cls: z.enum(["bottle", "bag", "other"]),
      conf: unit,
    }),
  ),
  foam_ratio: unit,
  summary: z.string(),
  confidence: unit,
  model_version: z.string(),
});
export const mediaAnalysisSchema = z.strictObject({
  media_id: id,
  analysis: detectionSchema,
  event_id: id.nullable(),
  bounty_id: id.nullable(),
});
export const eventTypeSchema = z.enum(["WASTE", "SENSOR_ANOMALY"]);
export const eventSchema: z.ZodType<RiverEvent> = z.strictObject({
  id,
  type: eventTypeSchema,
  severity: z.number().int().min(1).max(5),
  waste_score: unit,
  summary: z.string(),
  lat,
  lon,
  media_id: id.nullable(),
  bounty_id: id.nullable(),
  created_at: timestamp,
});
export const eventsSchema = z.strictObject({ items: z.array(eventSchema) });
export const payoutsSchema = z.strictObject({
  items: z.array(payoutSchema),
  totals: z.strictObject({ paid_cents: cents, pending_cents: cents }),
});
export const payoutActionSchema = z.strictObject({ payout: payoutSchema });
export const payoutVetoSchema = z.strictObject({
  payout: payoutSchema,
  bounty: bountySchema,
});

export const donationSchema = z.strictObject({
  id,
  donor_name: z.string().nullable(),
  amount_cents: cents,
  currency,
  created_at: timestamp,
});
export const donationsSchema = z.strictObject({
  items: z.array(donationSchema),
  total_cents: cents,
});
export const donationOrderSchema = z.strictObject({
  donation_id: id,
  order_id: z.string(),
});
export const donationCaptureSchema = z.strictObject({
  donation: donationSchema.extend({ status: z.literal("CAPTURED") }),
});
export const treasurySchema: z.ZodType<Treasury> = z.strictObject({
  available_cents: cents,
  reserved_cents: cents,
  paid_cents: cents,
  donated_cents: cents,
  currency,
});
export const riverStatusSchema: z.ZodType<RiverStatus> = z.strictObject({
  river: z.string(),
  city: z.string(),
  health_score: z.number().int().min(0).max(100),
  trend: z.enum(["improving", "stable", "worsening"]),
  latest_reading: readingSchema.nullable(),
  open_bounties: z.number().int().nonnegative(),
  events_24h: z.number().int().nonnegative(),
  treasury: treasurySchema,
  updated_at: timestamp,
});
export const diarySchema: z.ZodType<Diary> = z.strictObject({
  id,
  text: z.string(),
  mood: z.enum(["hopeful", "worried", "grateful"]),
  model_version: z.string(),
  created_at: timestamp,
});
export const fundraiseSchema = z.strictObject({
  invoice_id: z.string(),
  amount_cents: cents,
  status: z.literal("SENT"),
  agent_rationale: z.string(),
});
export const resetSchema = z.strictObject({ reset: z.literal(true) });

export type Health = components["schemas"]["HealthResponse"];
export type Reading = components["schemas"]["ReadingOut"];
export type Bounty = components["schemas"]["Bounty"];
export type BountyStatus = components["schemas"]["Bounty"]["status"];
export type Claim = components["schemas"]["ClaimResponse"];
export type Proof = components["schemas"]["ProofResponse"];
export type Verification = components["schemas"]["Verification"];
export type Detection = components["schemas"]["Detection"];
export type RiverEvent = components["schemas"]["EventOut"];
export type EventType = components["schemas"]["EventOut"]["type"];
export type Payout = components["schemas"]["Payout"];
export type PayoutStatus = components["schemas"]["Payout"]["status"];
export type Donation = components["schemas"]["DonationItem"];
export type Treasury = components["schemas"]["Treasury"];
export type RiverStatus = components["schemas"]["RiverStatusResponse"];
export type Diary = components["schemas"]["DiaryResponse"];

export type ClaimInput = components["schemas"]["ClaimIn"];
export type DonationOrderInput = components["schemas"]["DonationOrderIn"];
export type FundraiseInput = components["schemas"]["FundraiseIn"];
export interface MediaInput {
  file: File;
  lat?: number;
  lon?: number;
  captured_at?: string;
  source?: "camera" | "upload";
}
export interface ProofInput {
  before: File;
  after: File;
  lat: number;
  lon: number;
  before_captured_at: string;
  after_captured_at: string;
}

export const userSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.enum(["worker", "council"]),
});
export type User = z.infer<typeof userSchema>;
export const authSessionSchema = z.object({
  user: userSchema,
  token: z.string().min(1),
});
export const meSchema = z.object({ user: userSchema });
export type AuthSession = z.infer<typeof authSessionSchema>;
