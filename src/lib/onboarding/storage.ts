import { isTurnRequest, toTurnRequest } from "@/lib/assistant/contract";
import { isOnboardingState, isRecord } from "./guards";
import {
  ONBOARDING_STATE_VERSION,
  PROFILE_FIELDS,
  type OnboardingState,
} from "./types";
import { validateProfileValue } from "./validation";

export const STORAGE_KEY = "persona.onboarding";

interface PersistedEnvelope {
  version: number;
  state: OnboardingState;
}

/**
 * Upgrades a stored state from an older version one step at a time. Each
 * entry takes the state at version N and returns it at version N + 1.
 */
const MIGRATIONS: Record<number, (state: unknown) => unknown> = {
  // v2 renamed `profile.helpRequest` to `profile.helpIntent`.
  1: (state) => {
    if (!isRecord(state) || !isRecord(state.profile)) return state;
    const { helpRequest, ...profile } = state.profile;
    return { ...state, profile: { ...profile, helpIntent: helpRequest ?? null } };
  },
  // v3 added voice calls: messages gained `callId`, attempts gained explicit
  // end reasons, and stated preferences were added. v2 had no call UI, so
  // any attempt it holds is closed as interrupted.
  2: (state) => {
    if (!isRecord(state)) return state;
    const messages = Array.isArray(state.messages)
      ? state.messages.map((m) => (isRecord(m) ? { ...m, callId: null } : m))
      : state.messages;
    const attempts =
      isRecord(state.call) && Array.isArray(state.call.attempts)
        ? state.call.attempts.map((a) =>
            isRecord(a)
              ? {
                  id: a.id,
                  startedAt: a.startedAt,
                  connectedAt: null,
                  endedAt: a.endedAt ?? a.startedAt,
                  endReason: "interrupted",
                  failure: null,
                }
              : a,
          )
        : [];
    return {
      ...state,
      mode: "text",
      messages,
      call: { status: "idle", attempts },
      preferences: { gmail: "unknown", call: "unknown" },
    };
  },
  // v4 added real Google OAuth. Nothing before it could connect Gmail, so any
  // stored status other than a failure becomes not connected.
  3: (state) => {
    if (!isRecord(state)) return state;
    const status =
      isRecord(state.gmail) && state.gmail.status === "failed"
        ? "failed"
        : "not_connected";
    return {
      ...state,
      gmail: { status, email: null, connectedAt: null, lastFailure: null },
    };
  },
  // v5 added graduation. Nothing before it could complete onboarding. A
  // stored helpIntent was never judged for concreteness: the model judges it
  // on the next user message, without being told it is vague.
  4: (state) => {
    if (!isRecord(state)) return state;
    return {
      ...state,
      status: state.status === "completed" ? "in_progress" : state.status,
      understanding: { helpIntentIsConcrete: null, wantsToSkipSetup: false },
      completion: null,
    };
  },
};

function migrate(version: unknown, state: unknown): unknown {
  if (typeof version !== "number" || !Number.isInteger(version)) {
    throw new Error(`Invalid version: ${String(version)}`);
  }
  if (version > ONBOARDING_STATE_VERSION) {
    throw new Error(`Unsupported future version: ${version}`);
  }
  let current = state;
  for (let v = version; v < ONBOARDING_STATE_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`No migration from version ${v}`);
    current = step(current);
  }
  return current;
}

/**
 * Hand-edited or corrupted data can have the right shape but values the app
 * never produces (an over-long name or message, a name with line breaks). The
 * server would reject every turn with them, so they count as invalid.
 */
function isWithinLimits(state: OnboardingState): boolean {
  return (
    isTurnRequest(toTurnRequest(state)) &&
    PROFILE_FIELDS.every((field) => {
      const value = state.profile[field];
      if (value === null) return true;
      const result = validateProfileValue(field, value);
      return result.ok && result.value === value;
    })
  );
}

/**
 * Returns the stored state, or `null` if nothing usable is stored. Invalid or
 * unmigratable data is removed so the app starts fresh instead of crashing.
 */
export function loadOnboardingState(): OnboardingState | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) throw new Error("Stored value is not an object");
    const state = migrate(parsed.version, parsed.state);
    if (!isOnboardingState(state) || !isWithinLimits(state)) {
      throw new Error("Stored state failed validation");
    }
    return state;
  } catch (error) {
    console.warn("Discarding stored onboarding state.", error);
    clearOnboardingState();
    return null;
  }
}

export function saveOnboardingState(state: OnboardingState): void {
  const envelope: PersistedEnvelope = {
    version: ONBOARDING_STATE_VERSION,
    state,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch (error) {
    // Storage can be full or disabled (e.g. some private browsing modes).
    console.warn("Could not persist onboarding state.", error);
  }
}

export function clearOnboardingState(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}
