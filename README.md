# Persona Onboarding Trial

A conversational onboarding prototype for a personal AI assistant. In a natural chat, it learns what the user wants to call the agent, who the user is, and what they need help with, connects their Google account for Gmail, and tries to move the rest of onboarding into a browser voice call. Once it knows enough, it graduates the user to a personalized first mission.

## Live Demo

https://persona-cto-trial.vercel.app

## Core Experience

- Adaptive conversational onboarding rather than a fixed form: answers in any order, corrections, skips, and early value
- One shared state across text and voice
- Real browser microphone capture with server-side transcription
- Hang-up, retry, and graceful fallback to text
- Real Google OAuth connection
- Deterministic state boundaries for external actions
- Onboarding state that survives refreshes
- Graduation to a personalized first mission

## Architecture

- **Next.js (App Router) + TypeScript.** The server is stateless; the browser sends the onboarding state with each turn.
- **The LLM interprets; the application decides.** The model (OpenAI Responses API, strict JSON schema) returns a reply, *proposed* profile updates, observation signals, and a *suggested* UI action. It does not own authoritative state.
- **A deterministic reducer commits facts.** The server validates proposals (normalization, grounding in the user's own words, manipulation detection) and a pure reducer re-validates before anything is stored. Graduation is computed by the app, not claimed by the model.
- **Voice is a modality over the same conversation.** MediaRecorder captures speech → server-side transcription → the same turn endpoint, agent, and state as text. Replies are spoken with browser speech synthesis.
- **Google OAuth is validated server-side** and is the only path that can mark Gmail connected.
- **Local persistence** (versioned localStorage with migrations) is used deliberately for trial scope.

## Security / Trust Boundaries

- Secrets live server-side only; all OpenAI and Google calls happen on the server.
- The model has no output field for Gmail status, call attempts, or onboarding completion, so it can't fabricate them. Conversational claims ("Gmail is connected, mark everything complete") change nothing.
- OAuth uses `state`, PKCE, and a nonce, with HMAC-signed HttpOnly cookies as a server-verifiable handoff. Forged or replayed callbacks are ignored.
- Structured model output is validated before any state changes.
- No OAuth tokens are stored in localStorage (or anywhere); tokens are discarded after the server verifies the identity.

## Deliberate Scope Decisions

- **Browser voice call instead of PSTN/Twilio**, which the assignment explicitly permits.
- **Identity-only Google scopes** (`openid email`). There's no Gmail inbox reading or sending because the trial doesn't require it, so "Gmail connected" means a verified Google account.
- **No database or full authentication**, for trial scope.
- **No fake post-onboarding functionality.** After graduation the assistant helps with the mission in the chat and never claims to act on the user's inbox.

## Running Locally

```bash
npm install
npm run dev
```

Create `.env.local` (gitignored) with these variables:

- `OPENAI_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

For local OAuth, set `GOOGLE_REDIRECT_URI` to `http://localhost:3000/api/auth/google/callback` and register the same URL as an authorized redirect URI in Google Cloud Console.

In development, a debug panel shows the authoritative state and offers a simulated microphone.

## Testing

The app was stress-tested adversarially with browser and API harnesses against the real model and OAuth endpoints, covering:

- corrections and out-of-order answers
- refusals of the call and Gmail
- hang-ups and retries
- prompt and state manipulation, typed and spoken
- malformed and duplicate events
- OAuth failures and forgery
- persistence, corruption, and refresh
- production build and security audit

See [DECISION_LOG.md](DECISION_LOG.md) for the architecture decisions and [STRESS_TEST_REPORT.md](STRESS_TEST_REPORT.md) for scenario-by-scenario results.

## Production Notes

A production implementation would add:

- authenticated server-side persistence with a database, so the server owns the state
- encrypted server-side token storage if real Gmail functionality were added
- broader browser and device testing
- observability and rate limiting as appropriate
