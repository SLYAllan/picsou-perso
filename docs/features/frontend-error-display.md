# Feature: Frontend Error Display (`extractErrorMessage`)

> Last updated: 2026-04-25

## Context

Sync flows used to surface raw payloads to the user — e.g. *"Enable Banking auth
failed: {"code":400,"message":"Redirect URI not allowed",...}"* — because every
caller did its own ad-hoc message extraction (`err.message`, `err.response.data`,
or a hand-written regex). A single helper now normalises Axios errors into a
human-readable string, with a fallback caller-controlled message.

## How it works

`extractErrorMessage(err, fallback)` walks the Axios error in priority order:

1. `err.response.data.detail` — Spring's RFC 7807 `ProblemDetail` field.
   - If the string contains `{`, slice from the first brace and try `JSON.parse`;
     on success use the embedded `message`. This handles adapter strings of the
     form `"Enable Banking auth failed: {...}"` where the upstream JSON body has
     been concatenated into the human message.
   - Otherwise return `detail` verbatim.
2. `err.response.data.message` — for endpoints that bypass `ProblemDetail`.
3. `err.message` — last resort; if it starts with `{` try the same JSON parse;
   skip the Axios boilerplate `"Request failed with status code N"` (useless to
   users); otherwise return as-is.
4. The caller-supplied `fallback` (defaults to French *"Une erreur est survenue"*).

### Key files

- `frontend/src/lib/errors.ts` — the helper plus a private `tryParseJson`. No
  external deps.
- `frontend/src/lib/errors.test.ts` — 8 Vitest cases covering each branch
  (Spring detail, embedded JSON in detail, plain detail, message field, JSON in
  `err.message`, plain `err.message`, the Axios-boilerplate skip, fallback when
  no signal is available).

Used by:

- `frontend/src/pages/sync/BankSyncTab.tsx` — replaces hand-written extraction in
  `completeMutation.onError` and `initiateMutation.onError`.
- `frontend/src/pages/sync/TradeRepublicTab.tsx` — `formatAuthError` fallback.
- `frontend/src/pages/sync/BoursoTab.tsx` — `formatError` fallback.
- `frontend/src/pages/sync/FinaryTab.tsx` — replaces `err instanceof Error ? err.message : ...`.
- `frontend/src/pages/sync/CryptoExchangeTab.tsx`,
  `frontend/src/pages/sync/CryptoWalletTab.tsx` — error states show
  `extractErrorMessage(error)`.
- `frontend/src/pages/admin/sections/{Security,EnableBanking}Section.tsx` — TanStack
  Query mutation `error` rendered through the helper.

## Technical choices

| Choice | Why | Rejected alternative |
|--------|-----|----------------------|
| `detail.indexOf('{')` + `slice` + `JSON.parse` | Spring `ProblemDetail.detail` is a flat `String`; adapters concatenate upstream JSON bodies into it. Slicing from the first brace + parsing handles arbitrary nesting. | Regex (`/\{.*\}/`) — fragile on nested braces from nested upstream errors and on multi-line payloads. |
| Skip `"Request failed with status code N"` | Axios's default `err.message` for non-2xx — completely useless to a non-technical user. | Returning it as a fallback (regression on the very UX bug this fixes). |
| Caller-supplied `fallback` | Each page wants a domain-specific default (`sync.tr.errors.unknownError`, `sync.bourso.errors.serverError`, `common.retry`). | One global fallback string — pages would still wrap it in their own `||`. |
| Default fallback in French | The app's primary locale is FR; English users hit the explicit `t(...)` override path anyway. | English default — would surface to FR users on the rare path where the caller forgot to pass a fallback. |
| Pure function in `lib/`, no React import | Reusable from non-component code (e.g. mutation `onError` callbacks, test files) and trivially mockable. | A custom hook (`useErrorMessage`) — overkill for a string transform. |

## Gotchas / Pitfalls

- **The fallback is for "no message at all", not "message but ugly".** If
  `err.response.data.detail` is `"Server error"` the helper returns `"Server error"`
  even when you passed a nicer fallback. Pages that want to map status codes to
  friendly strings (TradeRepublicTab's `formatAuthError`) must do the mapping
  *before* calling `extractErrorMessage` — only the unmapped tail should fall
  through to the helper.
- **`err.message` vs `err.response.data.message`.** Axios sets both, with
  different semantics: `err.message` is *Axios's* description ("Request failed with
  status code 400"), `err.response.data.message` is the server's body field. The
  helper consults the body first to avoid showing the Axios string when a real
  message is one level deeper.
- **`detail.indexOf('{')` matches the first `{` anywhere.** A detail string like
  *"Operation failed for {customerId}"* will trigger a (failed) parse, which
  silently falls through to returning the raw `detail`. That's the correct
  behaviour but worth understanding before tweaking the regex/slice logic.
- **Type cast `err as { response?: ...; message?: ... }`.** The helper accepts
  `unknown` for safety but does no runtime guards beyond the `typeof string`
  checks. If a non-Axios shape (e.g. a thrown plain string) reaches it, none of
  the branches match and the fallback is returned — which is the intended
  behaviour.

## Tests

- `frontend/src/lib/errors.test.ts` — 8 cases, all green via `npx vitest run`.
  Branches covered: Spring detail with embedded JSON; plain Spring detail;
  `data.message` when no detail; JSON inside `err.message`; plain `err.message`;
  the Axios `"Request failed with status code N"` skip; fallback when only the
  Axios boilerplate is present; fallback when nothing matches.
- No integration test wires this through a real Axios call — by design; the
  helper is a pure function and the contract is asserted at the unit level.

## Links

- Backend error contract this consumes:
  [`docs/conventions/error-handling.md`](../conventions/error-handling.md) —
  `ProblemDetail` shape and the `detail` field semantics.
- First consumer outside `pages/sync/`:
  [`admin-page.md`](./admin-page.md) (mutation error rows).
