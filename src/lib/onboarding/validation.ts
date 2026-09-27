import type { ProfileField } from "./types";

export const PROFILE_FIELD_MAX_LENGTH: Record<ProfileField, number> = {
  agentName: 40,
  userName: 60,
  helpIntent: 200,
};

const MAX_NAME_WORDS = 4;
const MIN_HELP_INTENT_LENGTH = 3;

// Values a model tends to emit as placeholders rather than real answers.
const PLACEHOLDER_VALUES = new Set([
  "null",
  "undefined",
  "none",
  "unknown",
  "n/a",
  "na",
  "tbd",
  "name",
]);

const NAME_PATTERN = /^[\p{L}\p{M}\p{N}' ’.\-]+$/u;
const HAS_LETTER = /\p{L}/u;
const INVISIBLE_OR_CONTROL = /[\p{Cc}\p{Cf}]/gu;
const SURROUNDING_PUNCTUATION = /^[\s"'“”‘’`.,!?:;]+|[\s"'“”‘’`.,!?:;]+$/gu;

export type FieldValidation =
  | { ok: true; value: string }
  | { ok: false; reason: string };

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(INVISIBLE_OR_CONTROL, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalizes a proposed profile value and rejects anything that is empty,
 * too long, or clearly not a real answer for that field.
 */
export function validateProfileValue(
  field: ProfileField,
  raw: unknown,
): FieldValidation {
  if (typeof raw !== "string") return { ok: false, reason: "not a string" };

  const isName = field === "agentName" || field === "userName";
  let value = normalizeText(raw);
  if (isName) value = value.replace(SURROUNDING_PUNCTUATION, "");

  if (!value) return { ok: false, reason: "empty" };
  if (value.length > PROFILE_FIELD_MAX_LENGTH[field]) {
    return { ok: false, reason: "too long" };
  }
  if (!HAS_LETTER.test(value)) return { ok: false, reason: "no letters" };
  if (PLACEHOLDER_VALUES.has(value.toLowerCase())) {
    return { ok: false, reason: "placeholder value" };
  }

  if (isName) {
    if (!NAME_PATTERN.test(value)) {
      return { ok: false, reason: "contains characters not allowed in a name" };
    }
    if (value.split(" ").length > MAX_NAME_WORDS) {
      return { ok: false, reason: "too many words for a name" };
    }
  } else if (value.length < MIN_HELP_INTENT_LENGTH) {
    return { ok: false, reason: "too short" };
  }

  return { ok: true, value };
}
