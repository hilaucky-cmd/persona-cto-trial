import { NextResponse, type NextRequest } from "next/server";
import { getGoogleOAuthConfig } from "@/server/google-oauth/config";
import {
  appReturnUrl,
  isSameOrigin,
  setFlowCookie,
  setResultCookie,
} from "@/server/google-oauth/flow";
import {
  buildAuthorizationUrl,
  createAuthorizationFlow,
} from "@/server/google-oauth/google";

/**
 * Starts Google authorization from the Connect Gmail form. POST plus an
 * origin check means another site can't kick off a flow in the user's name.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const config = getGoogleOAuthConfig();
  if (!config) {
    const response = NextResponse.redirect(appReturnUrl(request), 303);
    setResultCookie(response, request, { status: "failed", reason: "not_configured" });
    return response;
  }

  const flow = createAuthorizationFlow();
  const response = NextResponse.redirect(buildAuthorizationUrl(config, flow), 303);
  setFlowCookie(response, request, flow);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
