// src/browse/QuickProblemSearchModal.ts
//
// JetBrains-style quick search for LeetCode problems. Backed by the in-memory
// `IndexedProblem[]` already cached by ProblemListService — no network call on
// the hot path. Intended entry points: command palette entry + the problem
// browser's own search box (see ProblemBrowserView); not yet wired to a command.
//
// Filtering logic is factored into a pure `filterProblems` helper so it can be
// unit-tested without instantiating a SuggestModal under happy-dom.
import { App, SuggestModal } from 'obsidian';
import { DIFFICULTY_CN, displayId, displayTitle } from './types';
import type { IndexedProblem } from './types';

export const QUICK_SEARCH_LIMIT = 50;

/** True when the row matches `lowered` across its displayable text fields. */
function textMatch(p: IndexedProblem, lowered: string): boolean {
  return (
    p.title.toLowerCase().includes(lowered) ||
    (p.titleCn !== undefined && p.titleCn.toLowerCase().includes(lowered)) ||
    p.slug.toLowerCase().includes(lowered)
  );
}

/**
 * Rank problems against `query`. Empty/whitespace query returns the first
 * `limit` rows in their natural order (matches LC's "newest first" feel from
 * the browser view). Numeric queries prioritize exact-id then id-prefix
 * matches; otherwise we case-insensitive substring-match across title /
 * titleCn / slug and cap at `limit`.
 */
export function filterProblems(
  problems: readonly IndexedProblem[],
  query: string,
  limit: number = QUICK_SEARCH_LIMIT,
): IndexedProblem[] {
  const q = query.trim();
  if (q.length === 0) return problems.slice(0, limit);

  const lowered = q.toLowerCase();
  const numeric = /^\d+$/.test(q) ? Number(q) : null;

  if (numeric !== null) {
    const exact: IndexedProblem[] = [];
    const prefix: IndexedProblem[] = [];
    const rest: IndexedProblem[] = [];
    for (const p of problems) {
      if (p.id === numeric) exact.push(p);
      else if (String(p.id).startsWith(q)) prefix.push(p);
      else if (textMatch(p, lowered)) rest.push(p);
    }
    return [...exact, ...prefix, ...rest].slice(0, limit);
  }

  const out: IndexedProblem[] = [];
  for (const p of problems) {
    if (textMatch(p, lowered)) {
      out.push(p);
      if (out.length === limit) break;
    }
  }
  return out;
}

export class QuickProblemSearchModal extends SuggestModal<IndexedProblem> {
  constructor(
    app: App,
    private readonly problems: readonly IndexedProblem[],
    private readonly onChoose: (p: IndexedProblem) => void,
  ) {
    super(app);
    this.setPlaceholder('搜索题号、题名或 slug…');
    this.emptyStateText =
      problems.length === 0
        ? '题库索引为空——打开题目浏览器同步一次即可。'
        : '没有匹配的题目。';
    this.limit = QUICK_SEARCH_LIMIT;
  }

  getSuggestions(query: string): IndexedProblem[] {
    return filterProblems(this.problems, query, QUICK_SEARCH_LIMIT);
  }

  renderSuggestion(p: IndexedProblem, el: HTMLElement): void {
    el.addClass('lc-quick-search__item');
    const title = el.createDiv({ cls: 'lc-quick-search__title' });
    title.createSpan({ cls: 'lc-quick-search__id', text: `${displayId(p)}. ` });
    title.createSpan({ cls: 'lc-quick-search__name', text: displayTitle(p) });
    const meta = el.createDiv({ cls: 'lc-quick-search__meta' });
    meta.createSpan({
      cls: `lc-quick-search__diff lc-diff--${p.diff.toLowerCase()}`,
      text: DIFFICULTY_CN[p.diff],
    });
    if (p.titleCn && p.title !== p.titleCn) {
      meta.createSpan({ cls: 'lc-quick-search__sep', text: ' · ' });
      meta.createSpan({ cls: 'lc-quick-search__slug', text: p.title });
    }
    meta.createSpan({ cls: 'lc-quick-search__sep', text: ' · ' });
    meta.createSpan({ cls: 'lc-quick-search__slug', text: p.slug });
  }

  onChooseSuggestion(p: IndexedProblem): void {
    this.onChoose(p);
  }
}
