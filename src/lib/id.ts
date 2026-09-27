/**
 * `crypto.randomUUID` is only available in secure contexts, so it is missing
 * when the dev server is opened over plain HTTP from another device (e.g. a
 * phone on the LAN).
 */
export function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
