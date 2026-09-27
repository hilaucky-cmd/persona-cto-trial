import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { GOOGLE_SCOPES, type GoogleOAuthConfig } from "./config";

const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const REQUEST_TIMEOUT_MS = 10_000;
/** Tolerated clock difference when checking token times. */
const CLOCK_SKEW_SECONDS = 300;

/** Secrets for one authorization attempt. Kept server-side in a signed cookie. */
export interface AuthorizationFlow {
  /** Echoed back by Google; binds the callback to this browser (CSRF). */
  state: string;
  /** PKCE: proves the code is redeemed by whoever started the flow. */
  codeVerifier: string;
  /** Echoed inside the ID token; binds the identity to this attempt. */
  nonce: string;
}

const random = (bytes: number) => randomBytes(bytes).toString("base64url");

export function createAuthorizationFlow(): AuthorizationFlow {
  return { state: random(32), codeVerifier: random(32), nonce: random(16) };
}

export function buildAuthorizationUrl(
  config: GoogleOAuthConfig,
  flow: AuthorizationFlow,
): string {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: createHash("sha256").update(flow.codeVerifier).digest("base64url"),
    code_challenge_method: "S256",
    // No refresh token: nothing uses Google on the user's behalf later.
    access_type: "online",
    prompt: "select_account",
  }).toString();
  return url.toString();
}

export class GoogleOAuthError extends Error {
  name = "GoogleOAuthError";
  constructor(
    readonly kind: "network" | "token_exchange" | "identity",
    /** Safe to log: an error code or reason, never a token or secret. */
    readonly detail: string,
  ) {
    super(`${kind}: ${detail}`);
  }
}

/**
 * Redeems the authorization code and returns Google's ID token. The access
 * token in the same response is not needed and is dropped immediately.
 */
export async function exchangeCode(
  config: GoogleOAuthConfig,
  code: string,
  codeVerifier: string,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        code_verifier: codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: config.redirectUri,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    throw new GoogleOAuthError(
      "network",
      error instanceof Error ? error.name : "fetch failed",
    );
  }

  const body: unknown = await response.json().catch(() => null);
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  if (!response.ok) {
    const code = typeof record.error === "string" ? record.error : "unknown";
    throw new GoogleOAuthError("token_exchange", `HTTP ${response.status} ${code}`);
  }
  if (typeof record.id_token !== "string") {
    throw new GoogleOAuthError("token_exchange", "no id_token in response");
  }
  return record.id_token;
}

export interface VerifiedIdentity {
  /** Google's stable account id. */
  subject: string;
  email: string;
}

/**
 * Validates the ID token's claims. Its signature isn't checked: the token
 * came straight from Google's token endpoint over TLS in the server-to-server
 * exchange above, which OpenID Connect Core §3.1.3.7 accepts in place of
 * signature validation. A token received any other way would need it.
 */
export function verifyIdToken(
  idToken: string,
  config: GoogleOAuthConfig,
  expectedNonce: string,
): VerifiedIdentity {
  const fail = (reason: string): never => {
    throw new GoogleOAuthError("identity", reason);
  };

  const parts = idToken.split(".");
  if (parts.length !== 3) fail("malformed token");
  let claims: Record<string, unknown> = {};
  try {
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    fail("unreadable claims");
  }

  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!GOOGLE_ISSUERS.includes(claims.iss as string)) fail("wrong issuer");
  if (!audiences.includes(config.clientId)) fail("wrong audience");
  if (audiences.length > 1 && claims.azp !== config.clientId) fail("wrong authorized party");
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_SECONDS < now) fail("expired");
  if (typeof claims.iat !== "number" || claims.iat - CLOCK_SKEW_SECONDS > now) fail("issued in the future");
  if (typeof claims.nonce !== "string" || claims.nonce !== expectedNonce) fail("nonce mismatch");
  if (typeof claims.sub !== "string" || !claims.sub) fail("no subject");
  if (typeof claims.email !== "string" || !claims.email) fail("no email");
  if (claims.email_verified !== true) fail("email not verified");

  return { subject: claims.sub as string, email: claims.email as string };
}
