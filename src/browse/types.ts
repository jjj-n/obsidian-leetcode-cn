export interface IndexedProblem {
  id: number;                       // questionFrontendId parsed to number
  /** questionFrontendId verbatim — the display form. Kept because ids like
   *  "LCR 007" / "面试题 17.09" don't parse to a number (id becomes NaN);
   *  views render this string instead of `id` when present. */
  frontendId?: string;
  slug: string;                     // titleSlug
  title: string;
  /** Chinese title from cn's titleCn field. Optional: absent on .com rows and
   *  legacy cached indexes — display falls back to `title` via displayTitle(). */
  titleCn?: string;
  diff: 'Easy' | 'Medium' | 'Hard';
  paid: boolean;
  /**
   * User progress from LC's problemsetQuestionList response (Plan 05 populates).
   * 'solved'    → q.status === 'ac'
   * 'attempted' → q.status === 'notac'
   * 'untouched' → q.status is null / missing
   * Optional so Plan 02's tests that construct fixtures without status continue to type-check.
   */
  status?: 'solved' | 'attempted' | 'untouched';
  /** LC acceptance rate as a 0-100 percentage. Optional so legacy cached indexes
   *  (pre-acceptance-rate population) and test fixtures still type-check. */
  acRate?: number;
  /** LC topic tag slugs (e.g. ['array', 'hash-table']). Populated from
   *  q.topicTags[].slug in the problemsetQuestionList response. Optional so
   *  pre-topics cached indexes continue to type-check — filter treats `undefined`
   *  as "no topics known" (row never matches a topic filter). */
  topics?: string[];
}

export interface ProblemIndex {
  fetchedAt: number;
  /** Region the index was fetched from. Kept as a literal union (not
   *  LeetCodeRegion) because SettingsStore already imports this module — a
   *  reverse import would create a cycle. Optional: legacy caches (pre-region
   *  tagging) lack it — readers treat absence as a mismatch (stale, re-fetch). */
  region?: 'cn' | 'com';
  problems: IndexedProblem[];
}

/** Chinese display label per difficulty — the plugin-wide 难度 vocabulary
 *  (notes' frontmatter, search pickers, and the problem browser all share it). */
export const DIFFICULTY_CN: Record<'Easy' | 'Medium' | 'Hard', string> = {
  Easy: '简单',
  Medium: '中等',
  Hard: '困难',
};

/** The title a user-facing row should display: Chinese first, English fallback.
 *  Matches NoteWriter's note-filename precedence (titleCn ?? title) so the row
 *  label equals the note file the click opens. */
export function displayTitle(p: IndexedProblem): string {
  return p.titleCn && p.titleCn.length > 0 ? p.titleCn : p.title;
}

/** The display id of a row: verbatim frontendId when present (handles
 *  "LCR 007" / "面试题 17.09" whose numeric parse is NaN), else the numeric id. */
export function displayId(p: IndexedProblem): string {
  return p.frontendId ?? String(p.id);
}
