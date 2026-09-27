import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import {
  OAUTH_RETURN_PARAM,
  OAUTH_RETURN_VALUE,
  isGmailConnectionResult,
  isPlausibleEmail,
  type GmailConnectionResult,
} from "@/lib/gmail/connection";
import type { GmailFailure } from "@/lib/onboarding/types";
import type { GoogleOAuthConfig } from "./config";
import {
  GoogleOAuthError,
  exchangeCode,
  verifyIdToken,
  type AuthorizationFlow,
} from "./google";
import { safeEqual, seal, unseal } from "./signed-cookie";

/*
 * Two short-lived, HttpOnly, signed cookies carry the flow; nothing about it
 * is stored anywhere else and no tokens are kept.
 * - flow: the attempt's state, PKCE verifier and nonce, from start to callback.
 * - result: the verified outcome, from the callback to the page, read once.
 */
const FLOW_COOKIE = "persona_google_flow";
const RESULT_COOKIE = "persona_google_result";
const COOKIE_PATH = "/api/auth/google";
const FLOW_TTL_SECONDS = 10 * 60;
const RESULT_TTL_SECONDS = 5 * 60;
const MAX_CODE_LENGTH = 2048;

const isHttps = (request: NextRequest) => request.nextUrl.protocol === "https:";

export function setFlowCookie(
  response: NextResponse,
  request: NextRequest,
  flow: AuthorizationFlow,
) {
  response.cookies.set(FLOW_COOKIE, seal("flow", flow, FLOW_TTL_SECONDS), {
    httpOnly: true,
    secure: isHttps(request),
    // Lax, not Strict: it must come back on Google's top-level redirect.
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: FLOW_TTL_SECONDS,
  });
}

function readFlowCookie(request: NextRequest): AuthorizationFlow | null {
  const payload = unseal("flow", request.cookies.get(FLOW_COOKIE)?.value);
  if (typeof payload !== "object" || payload === null) return null;
  const { state, codeVerifier, nonce } = payload as Record<string, unknown>;
  return typeof state === "string" &&
    typeof codeVerifier === "string" &&
    typeof nonce === "string"
    ? { state, codeVerifier, nonce }
    : null;
}

export function setResultCookie(
  response: NextResponse,
  request: NextRequest,
  result: Exclude<GmailConnectionResult, { status: "none" }>,
) {
  response.cookies.set(RESULT_COOKIE, seal("result", result, RESULT_TTL_SECONDS), {
    httpOnly: true,
    secure: isHttps(request),
    sameSite: "strict",
    path: COOKIE_PATH,
    maxAge: RESULT_TTL_SECONDS,
  });
}

export function readResultCookie(request: NextRequest): GmailConnectionResult {
  const payload = unseal("result", request.cookies.get(RESULT_COOKIE)?.value);
  if (!isGmailConnectionResult(payload) || payload.status === "none") {
    return { status: "none" };
  }
  return payload.status === "connected"
    ? { status: "connected", email: payload.email }
    : { status: "failed", reason: payload.reason };
}

export function clearResultCookie(response: NextResponse) {
  response.cookies.set(RESULT_COOKIE, "", { path: COOKIE_PATH, maxAge: 0 });
}

export function clearFlowCookie(response: NextResponse) {
  response.cookies.set(FLOW_COOKIE, "", { path: COOKIE_PATH, maxAge: 0 });
}

/** Where Google's callback sends the browser: back into the conversation. */
export function appReturnUrl(request: NextRequest): URL {
  const url = new URL("/", request.nextUrl.origin);
  url.searchParams.set(OAUTH_RETURN_PARAM, OAUTH_RETURN_VALUE);
  return url;
}

/** Only this app's own pages may start a flow or read its result. */
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === request.nextUrl.origin;
}

const failed = (reason: GmailFailure) => ({ status: "failed" as const, reason });

/**
 * Validates Google's callback and, only if every check passes, returns the
 * verified account. Returns `null` when this browser has no flow in progress
 * (a forged or long-expired link): nothing was attempted, so nothing is
 * reported, not even a failure, which would count as trying Gmail. State is
 * checked before anything else, including before reading an error.
 */
export async function resolveCallback(
  request: NextRequest,
  config: GoogleOAuthConfig | null,
): Promise<Exclude<GmailConnectionResult, { status: "none" }> | null> {
  // Without a config the start route never sends anyone to Google.
  if (!config) return null;
  const flow = readFlowCookie(request);
  if (!flow) return null;

  const params = request.nextUrl.searchParams;
  const state = params.get("state");
  if (!state || !safeEqual(state, flow.state)) return failed("invalid_state");

  const error = params.get("error");
  if (error) return failed(error === "access_denied" ? "cancelled" : "google_error");

  const code = params.get("code");
  if (!code || code.length > MAX_CODE_LENGTH) return failed("missing_code");

  try {
    const idToken = await exchangeCode(config, code, flow.codeVerifier);
    const identity = verifyIdToken(idToken, config, flow.nonce);
    if (!isPlausibleEmail(identity.email)) return failed("identity_unverified");
    return { status: "connected", email: identity.email };
  } catch (error) {
    if (!(error instanceof GoogleOAuthError)) throw error;
    console.warn("[auth/google] callback rejected:", error.kind, error.detail);
    return failed(
      error.kind === "network"
        ? "network_error"
        : error.kind === "identity"
          ? "identity_unverified"
          : "token_exchange_failed",
    );
  }
}
