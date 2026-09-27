import "server-only";
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/**
 * Small tamper-proof values for cookies: base64url JSON plus an HMAC. The
 * browser can hold them but can't forge or alter them. Not encrypted, so
 * they only carry data the user may see (their own email, a random state).
 *
 * The key is derived from the OAuth client secret so no extra secret has to
 * be configured for this trial; `purpose` keeps a value minted for one cookie
 * from being accepted as another.
 */

let key: Buffer | null = null;

function signingKey(): Buffer {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error("GOOGLE_CLIENT_SECRET is not configured");
  key ??= Buffer.from(
    hkdfSync("sha256", secret, "persona-onboarding", "signed-cookie-v1", 32),
  );
  return key;
}

function mac(purpose: string, body: string): Buffer {
  return createHmac("sha256", signingKey()).update(`${purpose}.${body}`).digest();
}

export function seal(purpose: string, payload: object, ttlSeconds: number): string {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Date.now() + ttlSeconds * 1000 }),
  ).toString("base64url");
  return `${body}.${mac(purpose, body).toString("base64url")}`;
}

/** Returns the payload if the value is authentic and unexpired, else `null`. */
export function unseal(purpose: string, value: string | undefined): unknown {
  if (!value) return null;
  const [body, signature, ...rest] = value.split(".");
  if (!body || !signature || rest.length > 0) return null;
  const expected = mac(purpose, body);
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }
  try {
    const payload: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (
      typeof payload !== "object" ||
      payload === null ||
      typeof (payload as { exp?: unknown }).exp !== "number" ||
      (payload as { exp: number }).exp < Date.now()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/** Constant-time comparison of two strings. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
