import "server-only";

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Identity only: enough to prove which Google account the user authorized
 * and read its verified email. `profile` (name, photo) isn't used, and no
 * Gmail API scope is requested because nothing reads or sends mail yet.
 */
export const GOOGLE_SCOPES = ["openid", "email"] as const;

/** Reads the OAuth client from the server environment, or `null` if incomplete. */
export function getGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}
