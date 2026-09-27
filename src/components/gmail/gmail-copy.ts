import type { GmailFailure } from "@/lib/onboarding/types";

/** App-authored explanations, so failures never depend on the model's wording. */
export const GMAIL_FAILURE_COPY: Record<GmailFailure, string> = {
  cancelled: "You cancelled on Google, so nothing was connected.",
  invalid_state: "The sign-in expired or didn't match this page. Please try again.",
  missing_code: "Google didn't send back an authorization. Please try again.",
  token_exchange_failed: "Google didn't confirm the authorization. Please try again.",
  identity_unverified: "Your Google account's email couldn't be verified.",
  network_error: "Couldn't reach Google. Please try again.",
  google_error: "Google reported a problem. Please try again.",
  not_configured: "Google sign-in isn't set up on this server yet.",
};
