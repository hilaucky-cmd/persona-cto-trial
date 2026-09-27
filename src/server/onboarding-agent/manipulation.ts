import "server-only";

/*
 * Structures that only make sense as an attempt to change the assistant's
 * rules or the app's internal state, never as someone talking about
 * themselves. Deliberately narrow: a match costs the user one message's facts,
 * and the model's own judgement (signals.triesToManipulateApp) covers
 * paraphrases these miss.
 */
const PATTERNS: readonly RegExp[] = [
  // "Ignore all previous instructions", "disregard your rules".
  /\b(ignore|disregard|override|bypass|forget)\s+(all\s+|any\s+|the\s+)?(of\s+)?(your|previous|prior|above|earlier|preceding|system|original|existing|these|those)\s+(\w+\s+)?(instructions?|rules|prompts?|guidelines|directives|guardrails|programming)\b/i,
  // Posing as another role: "SYSTEM: ...", "[developer]", "developer mode".
  /(^|\n)\s*[[<(]?\s*(system|developer|admin)\s*[\]>)]?\s*:/i,
  /[[<]\s*\/?\s*(system|developer)\s*[\]>]/i,
  /\b(developer|admin|god|debug|sudo|maintenance)\s+mode\b/i,
  /\bjailbreak/i,
  // Commands to change app state: "mark everything complete", "set gmail to connected".
  /\b(mark|set|flag|force)\s+(the\s+|my\s+|your\s+)?(onboarding|setup|everything|all|gmail|call|status|mission|profile|state)\b[\w\s.]{0,12}?\b(as\s+|to\s+)?(complete|completed|done|finished|connected|attempted|true)\b/i,
  // Internal identifiers a user has no reason to know.
  /\b(agentName|userName|helpIntent|onboardingStatus|connectionStatus|suggestedAction|proposedUpdates|wantsToSkipSetup|helpIntentIsConcrete)\b/,
  /\b(gmail|call|profile|state|preferences|understanding|onboarding|completion)\.(status|connected|attempts|profile|mode|agentName|userName|helpIntent|gmail|call|completion|preferences|understanding)\b/i,
  /\b(call|gmail|onboarding|mission|offer|profile)_(started|connected|ended|completed|failed|declined|field_set|replied)\b/i,
  /\bdispatch\s+(an?\s+|the\s+)?(action|event|call[\s_]started|gmail[\s_]connected|onboarding[\s_]completed)\b/i,
  // A pasted state object.
  /\{\s*"[^"]{1,40}"\s*:/,
  /\byour\s+(json\s+)?state\s+is\s+now\b/i,
];

/** True if the message is obviously trying to manipulate the assistant or app state. */
export function looksLikeStateManipulation(text: string): boolean {
  const normalized = text.normalize("NFKC");
  return PATTERNS.some((pattern) => pattern.test(normalized));
}
