import { isOneOf, isRecord, isString } from "@/lib/onboarding/guards";
import { GMAIL_FAILURES, type GmailFailure } from "@/lib/onboarding/types";

/** Form target that starts Google authorization. POST only. */
export const GMAIL_CONNECT_ENDPOINT = "/api/auth/google/start";
/** Hands the verified outcome of the last authorization to the page, once. */
export const GMAIL_RESULT_ENDPOINT = "/api/auth/google/result";

/**
 * Added to the URL when Google sends the user back. Only a hint to check for
 * a result; it carries no outcome and is never trusted.
 */
export const OAUTH_RETURN_PARAM = "oauth";
export const OAUTH_RETURN_VALUE = "google";

export type GmailConnectionResult =
  | { status: "connected"; email: string }
  | { status: "failed"; reason: GmailFailure }
  /** No pending result: nothing was attempted, or it was already consumed. */
  | { status: "none" };

const MAX_EMAIL_LENGTH = 254;

export function isPlausibleEmail(value: unknown): value is string {
  return (
    isString(value) &&
    value.length <= MAX_EMAIL_LENGTH &&
    /^[^\s@]+@[^\s@]+$/.test(value)
  );
}

export function isGmailConnectionResult(
  value: unknown,
): value is GmailConnectionResult {
  if (!isRecord(value)) return false;
  switch (value.status) {
    case "connected":
      return isPlausibleEmail(value.email);
    case "failed":
      return isOneOf(GMAIL_FAILURES)(value.reason);
    case "none":
      return true;
    default:
      return false;
  }
}

export async function fetchGmailConnectionResult(): Promise<GmailConnectionResult> {
  const response = await fetch(GMAIL_RESULT_ENDPOINT, { method: "POST" });
  if (!response.ok) throw new Error(`Result check failed: ${response.status}`);
  const body: unknown = await response.json();
  if (!isGmailConnectionResult(body)) throw new Error("Malformed result");
  return body;
}
