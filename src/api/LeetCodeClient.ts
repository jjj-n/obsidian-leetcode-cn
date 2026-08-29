// src/api/LeetCodeClient.ts
// Thin wrapper over @leetnotion/leetcode-api. All network calls flow through
// `installRequestUrlFetcher()`'s replaced fetcher -> throttle -> requestUrl.
//
// OWNERSHIP: `isSessionExpired` is defined here and ONLY here (AUTH-04). Plan 03
// (AuthService) and Plan 06 (ProblemBrowserView) both call it from error paths.
// Neither redefines it.
import { LeetCodeAdvanced, LeetCodeCN, Credential, CredentialCN } from '@leetnotion/leetcode-api';
import type { PastContests, ContestQuestions } from '@leetnotion/leetcode-api';
import type { SettingsStore } from '../settings/SettingsStore';
import { fetchCNProblemDetail, fetchCNProblemSearch, fetchCNProblemListPage } from './LeetCodeCNAdapter';

/** One normalized row from the problemsetQuestionList page fetch — the common
 *  shape both regions (cn graphql adapter / .com lc.problems) are mapped onto,
 *  so ProblemListService consumes a single row type regardless of region. */
export interface ProblemListRow {
  /** Display id verbatim from LC — usually numeric, but also "LCR 007",
   *  "面试题 17.09", "剑指 Offer 09" for interview/LCR books. */
  questionFrontendId: string;
  titleSlug: string;
  title: string;
  /** cn Chinese title (titleCn field); empty string on .com and when LC omitted it. */
  titleCn: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  isPaidOnly: boolean;
  /** User progress: 'ac' = solved, 'notac' = attempted, null = anonymous/untouched. */
  status: 'ac' | 'notac' | null;
  /** Acceptance rate 0-100, when LC reported it. */
  acRate?: number;
  topicTags?: Array<{ slug?: string }>;
}

export interface ProblemListPage {
  questions: ProblemListRow[];
  /** LC's reported total problem count (cn carries it on page 1); null when unknown. */
  total: number | null;
}

/** LC's `question` object as returned by `lc.problem(slug)`.
 *  Only the fields we consume are declared; LC returns additional fields we ignore.
 *  Verified against node_modules/@leetnotion/leetcode-api/lib/index.js:356 which
 *  contains the literal GraphQL query. */
export interface LeetCodeProblemDetail {
  questionFrontendId: string;
  /** Phase 3 D-30 — LC's internal numeric id, distinct from `questionFrontendId`
   *  for some problems (premium variants). Submitted in the REST body as
   *  `question_id`. Source: `DetailedProblem.questionId` per the library's
   *  `lib/index.d.ts:300-302`. Optional because the library may omit it on
   *  older calls; callers fall back gracefully. */
  questionId?: string | null;
  titleSlug: string;
  title: string;
  /** cn localized title (`translatedTitle`). See `DetailCacheEntry.titleCn`. */
  translatedTitle?: string | null;
  content: string | null;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  isPaidOnly: boolean;
  exampleTestcases?: string;
  /** Phase 5.4 D-08 — JSON-serialized metaData with `params: [{name, type}]`.
   *  Used by RunModal to seed-split exampleTestcases by lines-per-case
   *  (params.length) when blank-line separators are absent, and by the
   *  verdict modal renderer to label per-case input rows. */
  metaData?: string;
  /** Phase 5.4 — first sample case (newline-separated values, one per line).
   *  Used as fallback for arity derivation when metaData is malformed. */
  sampleTestCase?: string;
  /** cn-only: `translatedName` is the Chinese label (e.g. 动态规划); .com
   *  responses leave it undefined and callers fall back to `name`. */
  topicTags?: Array<{ name: string; slug: string; translatedName?: string | null }>;
  codeSnippets?: Array<{ lang: string; langSlug: string; code: string }>;
  stats?: string;
}

export class LeetCodeClient {
  public lc!: InstanceType<typeof LeetCodeAdvanced>;
  public lcCN!: InstanceType<typeof LeetCodeCN>;
  private settings: SettingsStore;

  constructor(settings: SettingsStore) {
    this.settings = settings;
    // Ticket #05 — lazy-init: only construct the active region's client.
    // The other stays as the default (no-cred) instance as a safe fallback.
    const region = settings.getRegion();
    if (region === 'cn') {
      this.lcCN = new LeetCodeCN();
    } else {
      this.lc = new LeetCodeAdvanced();
    }
  }

  /** Rebuild the LeetCode client with current cookies and await Credential bootstrap.
   *  Call this from onload() and from AuthService after login/logout to guarantee
   *  the LC client's credential is fully initialized before the first API call. */
  async reauthenticate(): Promise<void> {
    const cookies = this.settings.getAuthCookies();
    const region = this.settings.getRegion();
    if (!cookies) {
      if (region === 'cn') {
        this.lcCN = new LeetCodeCN();
      } else {
        this.lc = new LeetCodeAdvanced();
      }
      return;
    }
    if (region === 'cn') {
      const cred = new CredentialCN();
      await cred.init(cookies.LEETCODE_SESSION);
      this.lcCN = new LeetCodeCN(cred);
    } else {
      const cred = new Credential();
      await cred.init(cookies.LEETCODE_SESSION);
      this.lc = new LeetCodeAdvanced(cred);
    }
  }

  /** Fetch the signed-in user's username via LC's `whoami` GraphQL query.
   *  Returns null if not signed in or if the call fails. Never throws — callers
   *  use the result for UI display only (settings tab Status line). */
  async fetchUsername(): Promise<string | null> {
    try {
      if (this.settings.getRegion() === 'cn') {
        const resp = await this.lcCN.graphql({
          query: 'query { userStatus { isSignedIn username } }',
        }) as { data?: { userStatus?: { isSignedIn?: boolean; username?: string } } };
        const u = resp?.data?.userStatus;
        if (!u || !u.isSignedIn || !u.username) return null;
        return u.username;
      }
      const resp = await (this.lc as unknown as {
        whoami: () => Promise<{ username?: string; isSignedIn?: boolean } | null>;
      }).whoami();
      if (!resp || !resp.isSignedIn || !resp.username) return null;
      return resp.username;
    } catch {
      return null;
    }
  }

  /** Fetch the signed-in user's username + premium status in a single whoami
   *  round-trip. Returns null if not signed in or on error. */
  async fetchWhoami(): Promise<{ username: string; isPremium: boolean | null } | null> {
    try {
      if (this.settings.getRegion() === 'cn') {
        const resp = await this.lcCN.graphql({
          query: 'query { userStatus { isSignedIn username isPremium } }',
        }) as { data?: { userStatus?: { isSignedIn?: boolean; username?: string; isPremium?: boolean | null } } };
        const u = resp?.data?.userStatus;
        if (!u || !u.isSignedIn || !u.username) return null;
        return {
          username: u.username,
          isPremium: typeof u.isPremium === 'boolean' ? u.isPremium : null,
        };
      }
      const resp = await (this.lc as unknown as {
        whoami: () => Promise<
          { username?: string; isSignedIn?: boolean; isPremium?: boolean | null } | null
        >;
      }).whoami();
      if (!resp || !resp.isSignedIn || !resp.username) return null;
      return {
        username: resp.username,
        isPremium: typeof resp.isPremium === 'boolean' ? resp.isPremium : null,
      };
    } catch {
      return null;
    }
  }

  /** Fetch problem detail by slug. Returns the LC `question` object or null.
   *
   *  DIVERGENCE from fetchWhoami: Phase 2 callers (NoteWriter, D-13) need to
   *  distinguish "LC returned null" (treated as not-found OR session-expired,
   *  disambiguated via isSessionExpired) from "network threw" (treated as
   *  offline — Notice + abort). fetchWhoami conflates the two because it's
   *  display-only. Here we RE-THROW network errors so the caller can branch.
   *
   *  On success: returns the detail.
   *  On LC null-data: returns null (caller checks isSessionExpired vs not-found).
   *  On network error: throws (caller catches, inspects via isSessionExpired,
   *  and shows an appropriate Notice).
   */
  async getProblemDetail(slug: string): Promise<LeetCodeProblemDetail | null> {
    if (this.settings.getRegion() === 'cn') {
      return fetchCNProblemDetail(this.lcCN, slug);
    }
    const q = await (this.lc as unknown as {
      problem: (s: string) => Promise<LeetCodeProblemDetail | null>;
    }).problem(slug);
    if (!q || !q.questionFrontendId) return null;
    return q;
  }

  /** cn server-side problem search (title/titleCn keywords). See fetchCNProblemSearch. */
  async searchCNProblems(
    keyword: string,
    limit = 20,
  ): Promise<import('./LeetCodeCNAdapter').CNProblemSearchHit[]> {
    return fetchCNProblemSearch(this.lcCN, keyword, limit);
  }

  /** Fetch ONE page of the full problem list (problemsetQuestionList), region-
   *  dispatched like getProblemDetail. cn goes through the graphql adapter
   *  (fetchCNProblemListPage); .com maps the @leetnotion `lc.problems()` result
   *  onto the same ProblemListRow shape (titleCn always ''). Rows without a
   *  slug are dropped so downstream id/slug addressing stays sound.
   *  Network errors propagate — callers (ProblemListService) branch on them. */
  async getProblemListPage(opts: { limit: number; skip: number }): Promise<ProblemListPage> {
    if (this.settings.getRegion() === 'cn') {
      return fetchCNProblemListPage(this.lcCN, opts);
    }
    const page = await (this.lc as unknown as {
      problems: (o: { limit: number; offset: number }) => Promise<{
        questions?: Array<{
          questionFrontendId?: string;
          titleSlug?: string;
          title?: string;
          difficulty?: 'Easy' | 'Medium' | 'Hard';
          isPaidOnly?: boolean;
          status?: 'ac' | 'notac' | null;
          acRate?: number;
          topicTags?: Array<{ slug?: string }>;
        }>;
        total?: number;
      }>;
    }).problems({ limit: opts.limit, offset: opts.skip });
    const questions: ProblemListRow[] = (page.questions ?? [])
      .filter((q) => typeof q.titleSlug === 'string' && q.titleSlug.length > 0)
      .map((q) => ({
        questionFrontendId: q.questionFrontendId ?? '',
        titleSlug: q.titleSlug as string,
        title: q.title ?? '',
        titleCn: '',
        difficulty: q.difficulty ?? 'Medium',
        isPaidOnly: q.isPaidOnly ?? false,
        status: q.status ?? null,
        acRate: typeof q.acRate === 'number' ? q.acRate : undefined,
        topicTags: Array.isArray(q.topicTags) ? q.topicTags : undefined,
      }));
    return { questions, total: typeof page.total === 'number' ? page.total : null };
  }

  /** Phase 10 CONTEST-01 — fetch past contests with pagination support.
   *  Delegates to LeetCodeAdvanced.getPastContests which returns { totalNum, contests[] }. */
  async getPastContests(opts?: { limit?: number; skip?: number }): Promise<PastContests> {
    return this.lc.getPastContests(opts ?? {});
  }

  /** Phase 10 CONTEST-04 — fetch contest questions for a given contest slug.
   *  Validates slug format (T-10-01 threat mitigation) before passing to the API. */
  async getContestQuestions(contestSlug: string): Promise<ContestQuestions> {
    // T-10-01: validate slug matches expected pattern before interpolation.
    if (!/^(weekly|biweekly)-contest-\d+$/.test(contestSlug)) {
      throw new Error(`Invalid contest slug format: ${contestSlug}`);
    }
    return this.lc.getContestQuestions(contestSlug);
  }
}

/**
 * Detect LC session expiry from a LeetCode response. (AUTH-04 - Plan 02 OWNS this helper.)
 *
 * Overloads:
 *
 *   1. `isSessionExpired(resp)` — Phase 1/3 shape. Inspects a GraphQL-shaped
 *      body where `data === null` is the primary signal and an `errors[]`
 *      message matching /logged in|authentication|CSRF|unauthori[sz]ed/i is
 *      the secondary signal. Kept backward-compatible for NoteWriter,
 *      leetcodeRest assertNotSessionExpired, AuthService.
 *
 *   2. `isSessionExpired(body, status)` — Phase 4 D-30 extension. Widens the
 *      signal set for the submission-history GraphQL client:
 *        (a) HTTP 401 — true (LC's JSON 401 shape for unauthenticated REST,
 *            and GraphQL returns 401 on token-revoked requests)
 *        (b) HTTP 403 — true (bare 403 seen on expired csrftoken against
 *            GraphQL; there's no body shape to inspect)
 *        (c) HTTP 200 + body.errors[] matching an auth-ish message — true
 *            (GraphQL returns 200 on most auth failures, reports via errors[])
 *        (d) Otherwise — falls through to the Phase 1/3 body-only signal
 *            (helps when LC happens to return a 200 + `data: null` shape).
 *
 *  Both overloads are pure: no I/O, no throws. Callers decide whether to
 *  raise SessionExpiredError or surface a different notice.
 */
export function isSessionExpired(resp: unknown): boolean;
export function isSessionExpired(body: unknown, status: number): boolean;
export function isSessionExpired(respOrBody: unknown, status?: number): boolean {
  // Phase 4 D-30 overload — status-aware signals first.
  if (typeof status === 'number') {
    // (a) HTTP 401 — always session-expired for LC. Applies to both REST
    //     (`{"detail": "Authentication credentials were not provided."}`) and
    //     GraphQL (some auth failures return 401 directly).
    if (status === 401) return true;
    // (b) HTTP 403 — GraphQL path's expired-csrftoken shape.
    if (status === 403) return true;
    // (c) HTTP 200 with auth-ish errors[] entries — fall through to the
    //     body-only signal below (which already covers this case).
    // (d) Any other status → inspect body.
  }

  // Phase 1/3 body-only signal (primary: data === null; secondary: auth-ish
  // errors[] message). Shared by both overloads for shape-level detection.
  if (!respOrBody || typeof respOrBody !== 'object') return false;
  const r = respOrBody as { data?: unknown; errors?: Array<{ message?: string }> };
  if (r.data === null) return true;
  if (!Array.isArray(r.errors)) return false;
  return r.errors.some((e) =>
    /logged in|authentication|CSRF|unauthori[sz]ed/i.test(e?.message ?? '')
  );
}
