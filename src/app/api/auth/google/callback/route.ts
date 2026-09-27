import { NextResponse, type NextRequest } from "next/server";
import { getGoogleOAuthConfig } from "@/server/google-oauth/config";
import {
  appReturnUrl,
  clearFlowCookie,
  resolveCallback,
  setResultCookie,
} from "@/server/google-oauth/flow";

/**
 * Google redirects here after consent. Whatever happened, the browser goes
 * back to the conversation; the outcome travels in a signed HttpOnly cookie,
 * never in the URL, so it can't be faked by editing a link.
 */
export async function GET(request: NextRequest) {
  let result: Awaited<ReturnType<typeof resolveCallback>>;
  try {
    result = await resolveCallback(request, getGoogleOAuthConfig());
  } catch (error) {
    console.error(
      "[auth/google] callback error:",
      error instanceof Error ? error.name : "unknown",
    );
    result = { status: "failed", reason: "network_error" };
  }
  if (result === null) {
    console.info("[auth/google] callback without a flow in progress; ignored");
  } else if (result.status === "failed") {
    console.info("[auth/google] not connected:", result.reason);
  }

  const response = NextResponse.redirect(appReturnUrl(request), 303);
  // One attempt per flow: the state can't be replayed.
  clearFlowCookie(response);
  if (result) setResultCookie(response, request, result);
  response.headers.set("Cache-Control", "no-store");
  // Keep the authorization code out of the next page's Referer.
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
