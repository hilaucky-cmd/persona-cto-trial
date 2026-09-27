import { NextResponse, type NextRequest } from "next/server";
import type { GmailConnectionResult } from "@/lib/gmail/connection";
import {
  clearResultCookie,
  isSameOrigin,
  readResultCookie,
} from "@/server/google-oauth/flow";

/**
 * Gives the page the verified outcome of the last authorization, once. This
 * is the only way the client learns Gmail is connected.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const response = NextResponse.json<GmailConnectionResult>(
    readResultCookie(request),
    { headers: { "Cache-Control": "no-store" } },
  );
  clearResultCookie(response);
  return response;
}
