// src/ui/ProblemSearchResultModal.ts
// Pick-one modal shown after Fetch problem receives a non-slug query (Chinese
// title, English keywords, bare number). Lists the cn server-side search hits
// (fetchCNProblemSearch) in a SuggestModal so the user can filter further and
// pick; the chosen slug flows back into the same onSubmit the direct-slug path
// uses. Filtering is factored into a pure `filterSearchHits` helper so it can
// be unit-tested without instantiating a SuggestModal under happy-dom.

import { SuggestModal } from 'obsidian';
import type { App } from 'obsidian';
import type { CNProblemSearchHit } from '../api/LeetCodeCNAdapter';

export const SEARCH_RESULT_LIMIT = 20;

/** Chinese display label per difficulty — matches the note's 难度 vocabulary. */
const DIFFICULTY_CN: Record<CNProblemSearchHit['difficulty'], string> = {
  Easy: '简单',
  Medium: '中等',
  Hard: '困难',
};

/**
 * Rank search hits against a follow-up `query` typed inside the picker.
 * Empty query returns the hits as-is (server already ranked them); otherwise
 * case-insensitive substring match across 题号 / 中文题名 / 英文题名 / slug.
 */
export function filterSearchHits(
  hits: readonly CNProblemSearchHit[],
  query: string,
  limit: number = SEARCH_RESULT_LIMIT,
): CNProblemSearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return hits.slice(0, limit);
  const out: CNProblemSearchHit[] = [];
  for (const h of hits) {
    if (
      h.frontendId.toLowerCase().includes(q) ||
      h.titleCn.toLowerCase().includes(q) ||
      h.title.toLowerCase().includes(q) ||
      h.slug.toLowerCase().includes(q)
    ) {
      out.push(h);
      if (out.length === limit) break;
    }
  }
  return out;
}

/** SuggestModal over a fixed set of server-search hits; onChoose emits the slug. */
export class ProblemSearchResultModal extends SuggestModal<CNProblemSearchHit> {
  constructor(
    app: App,
    private readonly hits: readonly CNProblemSearchHit[],
    private readonly onChooseSlug: (slug: string) => void | Promise<void>,
  ) {
    super(app);
    this.setPlaceholder('进一步筛选，或直接用方向键选择…');
    this.emptyStateText = '没有匹配的题目。';
    this.limit = SEARCH_RESULT_LIMIT;
  }

  getSuggestions(query: string): CNProblemSearchHit[] {
    return filterSearchHits(this.hits, query, SEARCH_RESULT_LIMIT);
  }

  renderSuggestion(hit: CNProblemSearchHit, el: HTMLElement): void {
    const title = el.createDiv({ cls: 'lc-quick-search__title' });
    title.createSpan({ cls: 'lc-quick-search__id', text: `${hit.frontendId}. ` });
    title.createSpan({ cls: 'lc-quick-search__name', text: hit.titleCn || hit.title });
    const meta = el.createDiv({ cls: 'lc-quick-search__meta' });
    meta.createSpan({
      cls: `lc-quick-search__diff lc-diff--${hit.difficulty.toLowerCase()}`,
      text: DIFFICULTY_CN[hit.difficulty],
    });
    if (hit.title && hit.titleCn) {
      meta.createSpan({ cls: 'lc-quick-search__sep', text: ' · ' });
      meta.createSpan({ cls: 'lc-quick-search__slug', text: hit.title });
    }
  }

  onChooseSuggestion(hit: CNProblemSearchHit): void {
    void this.onChooseSlug(hit.slug);
  }
}
