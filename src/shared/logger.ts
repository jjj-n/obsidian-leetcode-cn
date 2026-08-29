/**
 * Logger that redacts any object key matching /session|csrf|cookie|token/i.
 * MUST be used for any contextual logging that might carry auth objects.
 * Direct `console.*` calls with auth values are forbidden (enforced by grep gate).
 *
 * This file is the canonical logging wrapper — every level routes through
 * `console.warn` / `console.error` / `console.debug` (the three console
 * methods the recommended config's `no-console` allowlist permits). The
 * historical `info` level is kept as a public API but maps to `console.debug`
 * so the wrapper itself never invokes a forbidden console method.
 */
// Phase 07 T-07-05 — extended to cover AI key field names (apiKey, api_key,
// api-key, x-api-key) and Authorization-header tokens (bearer, authorization).
// `api[_-]?key` covers all four common spellings; the case-insensitive flag
// also handles camelCase (apiKey, ApiKey, APIKEY). Old v1.0 tokens stay in
// the same order so existing logger-redact tests remain green. Kept as a
// defensive rule even though the AI feature is deferred to v2.
const REDACT = /session|csrf|cookie|token|apikey|api[_-]?key|bearer|authorization/i;
// Value-level redaction pattern: auth-ish kv pairs embedded in error messages,
// stack traces, or config/request/response strings. e.g. "LEETCODE_SESSION=xyz"
// or "Cookie: csrftoken=abc". We redact the value while keeping the key visible
// for debugging context (AUTH-06 — cookies never logged in plaintext).
//
// Phase 07 T-07-05 extension:
//   - apikey / api_key / api-key / x-api-key — AI provider header names
//   - bearer — captures `Bearer sk-xyz` substrings that survive after the
//     `authorization:` prefix has already been redacted (e.g. when the header
//     value itself is logged separately or the prefix uses `:` followed by a
//     space which the original token consumed before the value).
//
// Phase 07 Plan 07 (CR-01 fix): replaced the v1 two-pass approach
// (BEARER_VALUE_PATTERN then SECRET_VALUE_PATTERN) with a single-pattern
// ordered alternation. The v1 two-pass produced garbled output for
// `'Authorization: Bearer sk-xyz'`:
//   pass 1 (BEARER_VALUE_PATTERN) → `'Authorization: Bearer [REDACTED]'`
//   pass 2 (SECRET_VALUE_PATTERN's `authorization` alternate) re-matched
//     `'Authorization: Bearer'` as a kv pair (with `Bearer` as the value
//     since the value char class permitted it), replacing the whole
//     match with `'Authorization=[REDACTED]'`, leaving the trailing
//     `[REDACTED]` token dangling — final shape:
//     `'Authorization=[REDACTED] [REDACTED]'`.
// The single-pattern fix below lists the `authorization: bearer <token>`
// shape FIRST in an ordered alternation so it wins as a single match
// before the bare `authorization` alternate ever sees the input. The
// replacement function keeps the original `:` separator instead of
// rewriting it as `=`. The bare `authorization` alternate stays in the
// pattern as a fallback for stringified forms like `Authorization=xyz`
// (no `Bearer` keyword) and for the other auth-ish keys.
//
// Phase 07 Plan 08 (CR-01-A + WR-02-separator advisory cleanup):
//   1. CR-01-A — `'Authorization: Bearer'` (no trailing token) was being
//      consumed by the second alternate with `Bearer` as the value,
//      producing `'Authorization=[REDACTED]'`. The `Bearer` token is a
//      scheme keyword, not a secret. The fix adds a negative lookahead
//      `(?!bearer\b)` in the second alternate's value char class so the
//      bare `Bearer` keyword can never match as a secret value. The
//      `/i` flag already on this regex means the lookahead is also
//      case-insensitive (matches Bearer, BEARER, bearer, etc.). After
//      this fix, `'Authorization: Bearer'` (no token) survives the
//      regex untouched — neither alternate matches.
//   2. WR-02-separator — the second alternate's replacement hardcoded
//      `=` as the separator, normalizing `'x-api-key: val'` to
//      `'x-api-key=[REDACTED]'`. The fix captures `[:=]` as a numbered
//      group and replays it in the replacement so the original
//      separator (`:` for header style, `=` for env-var style) is
//      preserved in the output.
//
// `s` flag NOT set — we do not want `.` to cross newlines; the pattern
// should match within a single header line.
const SECRET_VALUE_PATTERN =
  /\b(authorization)\s*:\s*(bearer)\s+([^\s;,"'&}\][]+)|\b(LEETCODE_SESSION|csrftoken|session|csrf|cookie|token|authorization|apikey|api[_-]?key|x-api-key)(\s*[=:]\s*)(?!bearer\b)([^\s;,"'&}\][]+)/gi;

function redactString(s: string): string {
  // Single-pass ordered-alternation redaction — see the doc comment above
  // SECRET_VALUE_PATTERN for the CR-01 fix rationale and the Plan 07-08
  // CR-01-A + WR-02-separator extensions.
  //
  // The replacement function chooses the output shape based on which
  // alternate fired:
  //   - authorization: bearer <token> → `<authKey>: <bearer> [REDACTED]`
  //     (preserves the original `:` separator and the `Bearer` keyword)
  //   - <key><sep><value>             → `<key><sep>[REDACTED]`
  //     where <sep> is the captured `:` or `=` from the input — preserves
  //     the input separator for both header style ('x-api-key: val') and
  //     env-var style ('LEETCODE_SESSION=val').
  return s.replace(
    SECRET_VALUE_PATTERN,
    (
      _m,
      authKey: string | undefined,
      bearerKey: string | undefined,
      _bearerTok: string | undefined,
      otherKey: string | undefined,
      otherSep: string | undefined,
      _otherVal: string | undefined,
    ) => {
      if (authKey !== undefined && bearerKey !== undefined) {
        return `${authKey}: ${bearerKey} [REDACTED]`;
      }
      return `${otherKey ?? ''}${otherSep ?? '='}[REDACTED]`;
    },
  );
}

function redact(obj: unknown, depth = 0): unknown {
  // Bound recursion depth to prevent runaway walks on pathologically deep or
  // cyclic payloads. Three levels is enough to reach err.config.headers.Cookie
  // without turning logging into a perf hazard.
  if (depth > 3) return obj;
  if (typeof obj === 'string') return redactString(obj);
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((v) => redact(v, depth + 1));
  // Unwrap Error so its enumerable-equivalent message/stack surface for redaction.
  // `Error` properties (message, stack, name) are non-enumerable, so a naive
  // Object.entries(err) returns [] and the Error passes through unredacted.
  const isError = obj instanceof Error;
  const plain: Record<string, unknown> = isError
    ? {
        name: obj.name,
        message: obj.message,
        stack: obj.stack,
        ...(obj as unknown as Record<string, unknown>),
      }
    : (obj as Record<string, unknown>);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(plain)) {
    if (REDACT.test(k)) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'string') {
      out[k] = redactString(v);
    } else if (v && typeof v === 'object') {
      out[k] = redact(v, depth + 1);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export const logger = {
  debug: (msg: string, ctx?: unknown): void => {
    console.debug(`[leetcode] ${msg}`, ctx !== undefined ? redact(ctx) : '');
  },
  info: (msg: string, ctx?: unknown): void => {
    // Routed through console.debug — `console.info` is outside the
    // recommended config's no-console allowlist (warn / error / debug only).
    console.debug(`[leetcode] ${msg}`, ctx !== undefined ? redact(ctx) : '');
  },
  warn: (msg: string, ctx?: unknown): void => {
    console.warn(`[leetcode] ${msg}`, ctx !== undefined ? redact(ctx) : '');
  },
  error: (msg: string, err?: unknown): void => {
    // Route through redact to satisfy AUTH-06; error objects carry request configs
    // that may include Authorization / Cookie headers, and error messages sometimes
    // embed raw cookie strings (e.g. "request failed: LEETCODE_SESSION=xyz").
    console.error(`[leetcode] ${msg}`, err !== undefined ? redact(err) : '');
  },
};
