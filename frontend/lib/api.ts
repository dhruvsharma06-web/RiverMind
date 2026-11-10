import { z } from "zod";
import * as contract from "@/lib/contracts";
import { clearSessionToken, getSessionToken } from "@/lib/auth-token";

export class ApiError extends Error {
  readonly code: contract.ErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(status: number, error: contract.ErrorResponse["error"]) {
    super(error.message);
    this.name = "ApiError";
    this.code = error.code;
    this.status = status;
    this.details = error.details;
  }
}

export interface RequestOptions {
  signal?: AbortSignal;
}
export interface IdempotentOptions extends RequestOptions {
  idempotencyKey: string;
}
export interface CouncilOptions extends RequestOptions {
  /** Optional: council users authenticate with their session token instead. */
  councilKey?: string;
}
export interface CouncilIdempotentOptions extends CouncilOptions {
  idempotencyKey: string;
}

interface ClientConfig {
  baseUrl: string;
  useMock: boolean;
  mockWorkflow?: boolean;
  fetcher?: typeof fetch;
  getToken?: () => string;
  timeoutMs?: number;
  aiTimeoutMs?: number;
}
interface EndpointOptions extends RequestOptions {
  method?: "GET" | "POST";
  body?: object | FormData;
  headers?: Record<string, string>;
  fixture: string;
  ai?: boolean;
  /** Auth endpoints: never attach a session token or treat 401 as expiry. */
  anonymous?: boolean;
}

function failure(
  status: number,
  code: contract.ErrorCode,
  message: string,
  details: Record<string, unknown> = {},
) {
  return new ApiError(status, { code, message, details });
}

export function createApiClient(config: ClientConfig) {
  const origin = new URL(config.baseUrl);
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  ) {
    throw new Error(
      "NEXT_PUBLIC_API_URL must be an HTTP(S) origin without a path, query, or credentials.",
    );
  }
  const fetcher =
    config.fetcher ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  let mockTransport:
    | Promise<ReturnType<typeof import("./mock-api").createMockTransport>>
    | undefined;

  async function request<S extends z.ZodType>(
    path: string,
    schema: S,
    options: EndpointOptions,
  ): Promise<z.infer<S>> {
    const controller = new AbortController();
    const duration = options.ai
      ? (config.aiTimeoutMs ?? 60_000)
      : (config.timeoutMs ?? 20_000);
    let timedOut = false;
    const abort = () => controller.abort();
    if (options.signal?.aborted)
      throw new DOMException("Request cancelled", "AbortError");
    options.signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, duration);

    try {
      const headers = new Headers({ Accept: "application/json" });
      let body: BodyInit | undefined;
      const token = options.anonymous
        ? ""
        : (config.getToken ?? getSessionToken)();
      const explicitAuth = Boolean(options.headers?.Authorization);
      const sent = token && !explicitAuth ? token : "";
      const merged: Record<string, string> = {
        ...(sent ? { Authorization: `Bearer ${sent}` } : {}),
        ...options.headers,
      };
      if (!config.useMock) {
        for (const [key, value] of Object.entries(merged))
          headers.set(key, value);
        if (options.body instanceof FormData) body = options.body;
        else if (options.body !== undefined) {
          headers.set("Content-Type", "application/json");
          body = JSON.stringify(options.body);
        }
      }

      if (config.useMock && config.mockWorkflow) {
        mockTransport ??= import("./mock-api").then(
          ({ createMockTransport }) => {
            let storage: Storage | undefined;
            try {
              storage =
                typeof window !== "undefined"
                  ? window.sessionStorage
                  : undefined;
            } catch {
              /* Memory-only demo. */
            }
            return createMockTransport(async (name) => {
              const response = await fetcher(`/fixtures/${name}`, {
                cache: "no-store",
                credentials: "omit",
              });
              if (!response.ok)
                throw failure(
                  response.status,
                  "INTERNAL",
                  "Demo fixtures could not be loaded. Please retry.",
                );
              return response.json();
            }, storage);
          },
        );
      }
      const response =
        config.useMock && config.mockWorkflow
          ? await (
              await mockTransport!
            )(path, { ...options, headers: merged }, options.fixture)
          : await fetcher(
              config.useMock
                ? `/fixtures/${options.fixture}`
                : `${origin.origin}/api/v1${path}`,
              {
                method: config.useMock ? "GET" : (options.method ?? "GET"),
                headers,
                body,
                signal: controller.signal,
                cache: "no-store",
                credentials: "omit",
                redirect: "error",
              },
            );
      if (response.status === 204 && response.ok)
        return undefined as z.infer<S>;
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        if (controller.signal.aborted)
          throw new DOMException("Request cancelled", "AbortError");
        throw failure(
          response.status,
          "INTERNAL",
          "The server returned an unreadable response. Please try again.",
        );
      }
      if (!response.ok) {
        if (response.status === 401 && sent && getSessionToken() === sent)
          clearSessionToken();
        const parsed = contract.errorResponseSchema.safeParse(data);
        if (parsed.success)
          throw new ApiError(response.status, parsed.data.error);
        // Never expose arbitrary proxy/server error bodies or HTML to the UI.
        throw failure(
          response.status,
          "INTERNAL",
          "The request could not be completed. Please try again.",
        );
      }
      const parsed = schema.safeParse(data);
      if (!parsed.success) {
        throw failure(
          response.status,
          "INTERNAL",
          "The response does not match the RiverMind contract.",
          { reason: "INVALID_RESPONSE" },
        );
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (options.signal?.aborted)
        throw new DOMException("Request cancelled", "AbortError");
      if (timedOut) {
        throw failure(
          0,
          "INTERNAL",
          "The request timed out. Check the current status before trying again.",
          { reason: "TIMEOUT" },
        );
      }
      throw failure(
        0,
        "INTERNAL",
        "Unable to reach RiverMind. Check your connection and try again.",
        { reason: "NETWORK" },
      );
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
    }
  }

  function query(
    path: string,
    filters: Record<string, string | number | undefined>,
  ) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters))
      if (value !== undefined) params.set(key, String(value));
    return params.size ? `${path}?${params}` : path;
  }
  const resourceId = (value: string) => encodeURIComponent(value);
  const councilHeaders = (key?: string): Record<string, string> =>
    key ? { Authorization: `Bearer ${key}` } : {};
  const idemHeaders = (key: string) => {
    if (!z.uuid().safeParse(key).success)
      throw failure(
        422,
        "VALIDATION_ERROR",
        "An idempotency key must be a UUID.",
      );
    return { "Idempotency-Key": key };
  };

  return {
    mode: config.useMock ? ("fixture" as const) : ("api" as const),
    register: (
      input: { name: string; email: string; password: string },
      options: RequestOptions = {},
    ) =>
      request("/auth/register", contract.authSessionSchema, {
        ...options,
        method: "POST",
        body: input,
        anonymous: true,
        fixture: "health.ok.json",
      }),
    login: (
      input: { email: string; password: string },
      options: RequestOptions = {},
    ) =>
      request("/auth/login", contract.authSessionSchema, {
        ...options,
        method: "POST",
        body: input,
        anonymous: true,
        fixture: "health.ok.json",
      }),
    logout: (options: RequestOptions = {}) =>
      request("/auth/logout", z.undefined(), {
        ...options,
        method: "POST",
        fixture: "health.ok.json",
      }),
    me: (options: RequestOptions = {}) =>
      request("/auth/me", contract.meSchema, {
        ...options,
        fixture: "health.ok.json",
      }),
    getHealth: (options: RequestOptions = {}) =>
      request("/health", contract.healthSchema, {
        ...options,
        fixture: "health.ok.json",
      }),
    getRiverStatus: (options: RequestOptions = {}) =>
      request("/river/status", contract.riverStatusSchema, {
        ...options,
        fixture: "river_status.ok.json",
      }),
    getReadings: (
      filters: { device_id?: string; limit?: number } = {},
      options: RequestOptions = {},
    ) =>
      request(query("/readings", filters), contract.readingsSchema, {
        ...options,
        fixture: "readings.ok.json",
      }),
    getEvents: (
      filters: { type?: contract.EventType; limit?: number } = {},
      options: RequestOptions = {},
    ) =>
      request(query("/events", filters), contract.eventsSchema, {
        ...options,
        fixture: "events.ok.json",
      }),
    getBounties: (
      filters: { status?: contract.BountyStatus } = {},
      options: RequestOptions = {},
    ) =>
      request(query("/bounties", filters), contract.bountiesSchema, {
        ...options,
        fixture: "bounties.ok.json",
      }),
    getBounty: (id: string, options: RequestOptions = {}) =>
      request(`/bounties/${resourceId(id)}`, contract.bountySchema, {
        ...options,
        fixture: "bounty.open.json",
      }),
    claimBounty: (
      id: string,
      input: contract.ClaimInput,
      options: RequestOptions = {},
    ) =>
      request(`/bounties/${resourceId(id)}/claim`, contract.claimSchema, {
        ...options,
        method: "POST",
        body: input,
        fixture: "claim.ok.json",
      }),
    submitProof: (
      id: string,
      input: contract.ProofInput,
      claimToken: string,
      options: RequestOptions = {},
    ) => {
      const body = new FormData();
      body.set("before", input.before);
      body.set("after", input.after);
      body.set("lat", String(input.lat));
      body.set("lon", String(input.lon));
      body.set("before_captured_at", input.before_captured_at);
      body.set("after_captured_at", input.after_captured_at);
      return request(
        `/bounties/${resourceId(id)}/proof`,
        contract.proofSchema,
        {
          ...options,
          method: "POST",
          body,
          headers: { "X-Claim-Token": claimToken },
          ai: true,
          fixture: "proof.verified.json",
        },
      );
    },
    analyzeMedia: (
      input: contract.MediaInput,
      options: RequestOptions = {},
    ) => {
      const body = new FormData();
      body.set("file", input.file);
      body.set("source", input.source ?? "upload");
      if (input.lat !== undefined) body.set("lat", String(input.lat));
      if (input.lon !== undefined) body.set("lon", String(input.lon));
      if (input.captured_at !== undefined)
        body.set("captured_at", input.captured_at);
      return request("/media/analyze", contract.mediaAnalysisSchema, {
        ...options,
        method: "POST",
        body,
        ai: true,
        fixture: "media_analyze.ok.json",
      });
    },
    getPayouts: (
      filters: { status?: contract.PayoutStatus } = {},
      options: RequestOptions = {},
    ) =>
      request(query("/payouts", filters), contract.payoutsSchema, {
        ...options,
        fixture: "payouts.ok.json",
      }),
    approvePayout: (
      id: string,
      input: { note?: string },
      options: CouncilIdempotentOptions,
    ) =>
      request(
        `/payouts/${resourceId(id)}/approve`,
        contract.payoutActionSchema,
        {
          signal: options.signal,
          method: "POST",
          body: input,
          headers: {
            ...councilHeaders(options.councilKey),
            ...idemHeaders(options.idempotencyKey),
          },
          fixture: "payout_approve.ok.json",
        },
      ),
    vetoPayout: (
      id: string,
      input: { reason: string },
      options: CouncilOptions,
    ) =>
      request(`/payouts/${resourceId(id)}/veto`, contract.payoutVetoSchema, {
        signal: options.signal,
        method: "POST",
        body: input,
        headers: councilHeaders(options.councilKey),
        fixture: "payout_veto.ok.json",
      }),
    retryPayout: (id: string, options: CouncilIdempotentOptions) =>
      request(`/payouts/${resourceId(id)}/retry`, contract.payoutActionSchema, {
        signal: options.signal,
        method: "POST",
        headers: {
          ...councilHeaders(options.councilKey),
          ...idemHeaders(options.idempotencyKey),
        },
        fixture: "payout_retry.ok.json",
      }),
    createDonationOrder: (
      input: contract.DonationOrderInput,
      options: IdempotentOptions,
    ) =>
      request("/donations/orders", contract.donationOrderSchema, {
        signal: options.signal,
        method: "POST",
        body: input,
        headers: idemHeaders(options.idempotencyKey),
        fixture: "donation_order.ok.json",
      }),
    captureDonation: (orderId: string, options: RequestOptions = {}) =>
      request(
        `/donations/orders/${resourceId(orderId)}/capture`,
        contract.donationCaptureSchema,
        { ...options, method: "POST", fixture: "donation_capture.ok.json" },
      ),
    getDonations: (
      filters: { limit?: number } = {},
      options: RequestOptions = {},
    ) =>
      request(query("/donations", filters), contract.donationsSchema, {
        ...options,
        fixture: "donations.ok.json",
      }),
    getDiary: (options: RequestOptions = {}) =>
      request("/diary/latest", contract.diarySchema, {
        ...options,
        fixture: "diary.ok.json",
      }),
    fundraise: (input: contract.FundraiseInput, options: CouncilOptions) =>
      request("/agent/fundraise", contract.fundraiseSchema, {
        signal: options.signal,
        method: "POST",
        body: input,
        headers: councilHeaders(options.councilKey),
        ai: true,
        fixture: "fundraise.ok.json",
      }),
  };
}

export const api = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  useMock: process.env.NEXT_PUBLIC_USE_MOCK === "true",
  mockWorkflow: true,
});
