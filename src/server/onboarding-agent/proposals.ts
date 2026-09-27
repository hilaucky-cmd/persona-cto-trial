import type { ModelProposal, RejectedUpdate } from "@/lib/assistant/contract";
import {
  PROFILE_FIELDS,
  type Message,
  type OnboardingProfile,
  type ProfileField,
  type ProfileUpdates,
} from "@/lib/onboarding/types";
import { validateProfileValue } from "@/lib/onboarding/validation";

/** Lowercased, accent-insensitive word tokens. */
function tokenize(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * A name is grounded if every word of it appears in the given messages. This
 * stops the model from inventing names nobody said.
 */
function isGrounded(name: string, sources: readonly Message[]): boolean {
  const available = new Set(sources.flatMap((m) => tokenize(m.content)));
  const words = tokenize(name);
  return words.length > 0 && words.every((word) => available.has(word));
}

/**
 * Which messages may justify a value for each field. The user's name must come
 * from the user. The agent's name may also come from a name the assistant
 * suggested earlier and the user then accepted.
 */
function groundingSources(
  field: ProfileField,
  context: readonly Message[],
): readonly Message[] | null {
  switch (field) {
    case "userName":
      return context.filter((m) => m.role === "user");
    case "agentName":
      return context;
    case "helpIntent":
      return null; // Paraphrased by design, so not checked word-for-word.
  }
}

/**
 * Deterministic gate between model output and application state. Only the
 * profile fields the model is allowed to interpret can pass, and only after
 * normalization, validation, and grounding checks.
 */
export function validateProposal(
  proposal: ModelProposal,
  profile: OnboardingProfile,
  context: readonly Message[],
): { accepted: ProfileUpdates; rejected: RejectedUpdate[] } {
  const accepted: ProfileUpdates = {};
  const rejected: RejectedUpdate[] = [];

  for (const field of PROFILE_FIELDS) {
    const raw = proposal[field];
    if (raw === null) continue;

    const result = validateProfileValue(field, raw);
    if (!result.ok) {
      rejected.push({ field, value: raw, reason: result.reason });
      continue;
    }
    if (result.value === profile[field]) {
      rejected.push({ field, value: raw, reason: "same as current value" });
      continue;
    }
    const sources = groundingSources(field, context);
    if (sources && !isGrounded(result.value, sources)) {
      rejected.push({ field, value: raw, reason: "not found in conversation" });
      continue;
    }
    accepted[field] = result.value;
  }

  return { accepted, rejected };
}
