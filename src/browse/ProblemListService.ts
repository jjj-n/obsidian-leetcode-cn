// src/browse/ProblemListService.ts
// Pure-logic service — no DOM. Consumed by ProblemBrowserView (Plan 06).
//
// Responsibilities (Plan 05):
//   - refresh()  : BROWSE-02 — page client.getProblemListPage({ limit, skip }) with
//                   PAGE_SIZE=50 until a short page or the reported total,
//                   populate IndexedProblem.status from q.status,
//                   persist via SettingsStore, honor 24h TTL.
//   - search()   : BROWSE-03 — in-memory case-insensitive title substring OR id-prefix.
//   - filter()   : BROWSE-04 — in-memory multi-select on difficulty AND status.
import type { LeetCodeClient, ProblemListRow } from '../api/LeetCodeClient';
import type { SettingsStore, CompoundFilter, FilterRule } from '../settings/SettingsStore';
import type { IndexedProblem, ProblemIndex } from './types';

export const INDEX_TTL_MS = 24 * 60 * 60 * 1000; // D-07: 24h TTL
export const PAGE_SIZE = 50; // D-07: page size (anti-bulk gate)

/** Per-page progress signal emitted during refresh() when a callback is supplied.
 *  `loaded` is cumulative rows fetched so far, `total` is LC's reported total when
 *  available (first page carries it), `rows` is the batch JUST loaded (for append-render). */
export interface RefreshProgress {
  loaded: number;
  total: number | null;
  rows: IndexedProblem[];
  done: boolean;
}
export type RefreshProgressCallback = (p: RefreshProgress) => void;

/** Map LC's `q.status` ('ac' | 'notac' | null, null when anonymous) into the
 *  `IndexedProblem.status` vocabulary (BROWSE-04 status dim). */
function mapStatus(s: ProblemListRow['status']): NonNullable<IndexedProblem['status']> {
  if (s === 'ac') return 'solved';
  if (s === 'notac') return 'attempted';
  // null or any unrecognized future LC value → neutral 'untouched' (T-05-06).
  return 'untouched';
}

export class ProblemListService {
  // WR-03: single-flight guard. If refresh() is called while a prior call is
  // still in flight (two views opened back-to-back, retry fires before the
  // first paginate loop finishes), return the SAME promise rather than
  // starting a duplicate paginate pass. Without this, both calls would see
  // a stale/null cache, each would issue ~66 paginated fetches for the full
  // 3,300-problem list, and whichever finished last would win the
  // setProblemIndex write — possibly persisting an incomplete index.
  private refreshPromise: Promise<IndexedProblem[]> | null = null;

  constructor(
    private readonly client: LeetCodeClient,
    private readonly settings: SettingsStore,
  ) {}

  /**
   * Return cached index if fresh (<24h); otherwise page LC.problems() until a short page,
   * populate each row's `status` from q.status, persist to data.json, and return.
   *
   * BROWSE-02: never bulk-downloads — always paginated with `limit: PAGE_SIZE (50)`.
   * WR-03: concurrent calls share the same in-flight promise.
   * @param force When true, bypass the TTL check and always re-fetch.
   */
  async refresh(force = false, onProgress?: RefreshProgressCallback): Promise<IndexedProblem[]> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this._doRefresh(force, onProgress).finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async _doRefresh(
    force: boolean,
    onProgress?: RefreshProgressCallback,
  ): Promise<IndexedProblem[]> {
    const cached = this.settings.getProblemIndex();
    if (!force && cached && Date.now() - cached.fetchedAt < INDEX_TTL_MS) {
      // Synthesize a single "done" progress tick so callers that rely on the
      // progress stream to drive UI state transitions (e.g. hide a progress bar)
      // still receive a terminal signal when we return cached data.
      if (onProgress) {
        onProgress({
          loaded: cached.problems.length,
          total: cached.problems.length,
          rows: cached.problems,
          done: true,
        });
      }
      return cached.problems;
    }
    const all: IndexedProblem[] = [];
    let offset = 0;
    let total: number | null = null;
    // Paginate with limit=50 (D-07). Loop terminates on a short page OR when
    // the reported total is reached — the total check is load-bearing on cn,
    // where the last page can be exactly PAGE_SIZE (the short-page signal
    // never fires). T-05-01.
    for (;;) {
      const page = await this.client.getProblemListPage({
        limit: PAGE_SIZE,
        skip: offset,
      });
      if (total === null && typeof page.total === 'number') {
        total = page.total;
      }
      const batch: IndexedProblem[] = [];
      for (const q of page.questions) {
        // Extract topic slugs. We store slugs (not names) because they're the
        // stable identifier LC uses in URLs / cross-referencing; the human-
        // readable name is easily reconstructed by replacing '-' with ' '
        // and capitalising. Tags with missing slug are dropped silently.
        const topics: string[] = Array.isArray(q.topicTags)
          ? q.topicTags
              .map((t) => (typeof t.slug === 'string' ? t.slug : null))
              .filter((s): s is string => s !== null)
          : [];
        const row: IndexedProblem = {
          id: Number(q.questionFrontendId),
          frontendId: q.questionFrontendId,
          slug: q.titleSlug,
          title: q.title,
          titleCn: q.titleCn || undefined,
          diff: q.difficulty,
          paid: q.isPaidOnly,
          status: mapStatus(q.status),
          acRate: typeof q.acRate === 'number' ? q.acRate : undefined,
          topics: topics.length > 0 ? topics : undefined,
        };
        all.push(row);
        batch.push(row);
      }
      const isLast =
        page.questions.length < PAGE_SIZE || (total !== null && all.length >= total);
      if (onProgress && batch.length > 0) {
        onProgress({ loaded: all.length, total, rows: batch, done: isLast });
      }
      if (isLast) break;
      offset += PAGE_SIZE;
    }
    const index: ProblemIndex = { fetchedAt: Date.now(), problems: all };
    await this.settings.setProblemIndex(index);
    return all;
  }

  /**
   * BROWSE-03: case-insensitive title substring OR id-prefix match.
   * Empty / whitespace-only term → returns input unchanged (the view renders all rows).
   */
  search(idx: IndexedProblem[], term: string): IndexedProblem[] {
    const q = term.trim().toLowerCase();
    if (!q) return idx;
    return idx.filter((p) =>
      p.title.toLowerCase().includes(q) || String(p.id).startsWith(q),
    );
  }

  /**
   * BROWSE-04: difficulty + status multi-select.
   * Both dimensions are optional; an empty array or missing field means "no constraint".
   * Across dimensions we AND (row must satisfy every populated dimension).
   * Within a dimension we OR (row matches if its value is in the list).
   *
   * Status mapping: rows whose `status` field is `undefined` are treated as `'untouched'`
   * so legacy index entries (pre-status-population) filter consistently with newly-refreshed ones.
   */
  filter(
    idx: IndexedProblem[],
    opts: { difficulty?: string[]; status?: string[] },
  ): IndexedProblem[] {
    const diffs = opts.difficulty;
    const statuses = opts.status;
    const hasDiff = !!diffs && diffs.length > 0;
    const hasStatus = !!statuses && statuses.length > 0;
    if (!hasDiff && !hasStatus) return idx;
    return idx.filter((p) => {
      if (hasDiff && !diffs.includes(p.diff)) return false;
      if (hasStatus) {
        const effective: NonNullable<IndexedProblem['status']> = p.status ?? 'untouched';
        if (!statuses.includes(effective)) return false;
      }
      return true;
    });
  }

  /**
   * Apply a compound (LC-style) filter. Each rule evaluates against one field;
   * `match: 'all'` ANDs across rules, `match: 'any'` ORs. An empty rule list
   * returns the input unchanged. A rule with no effective values (empty array,
   * null range bounds) is a no-op — it passes every row (doesn't prune anything).
   *
   * Rule semantics:
   * - status/difficulty/topics with `is`:      row's value must be in `values`
   * - status/difficulty/topics with `is-not`:  row's value must NOT be in `values`
   *   (topics: row matches if ANY of its topics is NOT in `values` for is-not;
   *   i.e., row is rejected only if all its topics are in `values` — intersection
   *   is empty. Matches LC's "problems tagged with anything other than X".)
   * - question-id / acceptance range: inclusive on both ends; null = unbounded
   * - premium: multi-value ['premium', 'non-premium', …] (Phase 5.2 D-03);
   *   empty values = no filter, both values selected = effectively no-op
   */
  applyCompoundFilter(idx: IndexedProblem[], f: CompoundFilter | null): IndexedProblem[] {
    if (!f || f.rules.length === 0) return idx;
    return idx.filter((p) => {
      const outcomes = f.rules.map((r) => evaluateRule(p, r));
      // Ignore no-op rules (undefined outcome) so a partially-filled filter row
      // (e.g. "Status is <blank>") doesn't accidentally reject all rows in AND
      // mode or include all rows in OR mode.
      const active = outcomes.filter((o): o is boolean => o !== undefined);
      if (active.length === 0) return true;
      return f.match === 'all' ? active.every((b) => b) : active.some((b) => b);
    });
  }
}

/** Evaluate a single rule against a row. Returns `undefined` if the rule is
 *  effectively empty (no values / null bounds) — callers must treat undefined
 *  as "skip this rule", not as a false match. */
function evaluateRule(p: IndexedProblem, r: FilterRule): boolean | undefined {
  switch (r.field) {
    case 'status': {
      if (r.values.length === 0) return undefined;
      const eff = p.status ?? 'untouched';
      const hit = r.values.includes(eff);
      return r.op === 'is' ? hit : !hit;
    }
    case 'difficulty': {
      if (r.values.length === 0) return undefined;
      const hit = r.values.includes(p.diff);
      return r.op === 'is' ? hit : !hit;
    }
    case 'topics': {
      if (r.values.length === 0) return undefined;
      const rowTopics = p.topics ?? [];
      // `is`: any row-topic intersects the rule values.
      // `is-not`: no row-topic intersects the rule values (empty intersection).
      const intersects = rowTopics.some((t) => r.values.includes(t));
      return r.op === 'is' ? intersects : !intersects;
    }
    case 'question-id': {
      if (r.min === null && r.max === null) return undefined;
      if (r.min !== null && p.id < r.min) return false;
      if (r.max !== null && p.id > r.max) return false;
      return true;
    }
    case 'acceptance': {
      if (r.min === null && r.max === null) return undefined;
      if (typeof p.acRate !== 'number') return false; // no acceptance data → doesn't match a range filter
      if (r.min !== null && p.acRate < r.min) return false;
      if (r.max !== null && p.acRate > r.max) return false;
      return true;
    }
    case 'premium': {
      // Phase 5.2 D-03 — multi-value semantics, mirrors status/difficulty/topics.
      // values=[] is a no-op (returns undefined → skip rule).
      // values=['premium'] → only paid rows pass.
      // values=['non-premium'] → only free rows pass.
      // values=['premium','non-premium'] → both match (effectively a no-op
      // from the user's perspective; evaluator still returns true per row).
      if (r.values.length === 0) return undefined;
      const rowVal = p.paid ? 'premium' : 'non-premium';
      return r.values.includes(rowVal);
    }
  }
}
// Phase 5.2 D-03 — exported so tests can exercise the evaluator directly
// without constructing a full CompoundFilter. See
// tests/browse/ProblemListService.premium.test.ts Wave 0 shell.
export { evaluateRule };
