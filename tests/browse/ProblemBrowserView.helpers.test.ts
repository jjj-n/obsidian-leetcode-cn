// tests/browse/ProblemBrowserView.helpers.test.ts
//
// Pure-logic unit tests for the problem browser view's exported helpers. The
// ItemView subclass itself is thin DOM assembly over these (obsidian-stub
// mock still required because the module imports obsidian types at top level).
import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', async () => await import('../helpers/obsidian-stub'));

import {
  applyViewPipeline,
  nearBottom,
  formatIndexAge,
  countActiveRules,
  collectTopicSlugs,
  EMPTY_VIEW_STATE,
  type BrowserViewState,
} from '../../src/browse/ProblemBrowserView';
import { ProblemListService } from '../../src/browse/ProblemListService';
import type { CompoundFilter, FilterRule } from '../../src/settings/SettingsStore';
import type { IndexedProblem } from '../../src/browse/types';

// Real service instance: search/filter/applyCompoundFilter are pure methods
// and exercise the exact pipeline the view will run.
const svc = new ProblemListService(null as never, null as never);

function p(id: number, title: string, diff: 'Easy' | 'Medium' | 'Hard' = 'Easy',
  status?: IndexedProblem['status'], topics?: string[]): IndexedProblem {
  return { id, slug: `slug-${id}`, title, diff, paid: false, status, topics };
}

const IDX: IndexedProblem[] = [
  p(1, 'Two Sum', 'Easy', 'solved', ['array', 'hash-table']),
  p(2, 'Add Two Numbers', 'Medium', 'attempted', ['linked-list']),
  p(3, 'Longest Substring', 'Medium', 'untouched', ['array']),
  p(4, 'Median of Two Sorted Arrays', 'Hard', undefined, ['array', 'binary-search']),
];

describe('applyViewPipeline', () => {
  it('passes everything through when term/chips/compound are all empty', () => {
    const out = applyViewPipeline(svc, IDX, { ...EMPTY_VIEW_STATE }, null);
    expect(out).toEqual(IDX);
  });

  it('chains search → chips → compound in order (all three narrow)', () => {
    const view: BrowserViewState = { term: 'two', difficulty: ['Easy', 'Medium'], status: ['solved'] };
    const compound: CompoundFilter = {
      match: 'all',
      rules: [{ field: 'topics', op: 'is', values: ['array'] }],
    };
    // term 'two' → ids 1,2,4; chips(Easy+Medium, solved) → id 1; topics array → id 1.
    const out = applyViewPipeline(svc, IDX, view, compound);
    expect(out.map((x) => x.id)).toEqual([1]);
  });

  it('applies chips even when term is empty, and compound even when chips are empty', () => {
    const chipsOnly = applyViewPipeline(
      svc, IDX, { term: '', difficulty: ['Hard'], status: [] }, null);
    expect(chipsOnly.map((x) => x.id)).toEqual([4]);

    const compoundOnly = applyViewPipeline(
      svc, IDX, { ...EMPTY_VIEW_STATE },
      { match: 'any', rules: [{ field: 'status', op: 'is', values: ['attempted', 'untouched'] }] });
    expect(compoundOnly.map((x) => x.id)).toEqual([2, 3, 4]);
  });

  it('searches the Chinese title (titleCn) through the same pipeline', () => {
    const cn: IndexedProblem[] = [
      { id: 1, slug: 'two-sum', title: 'Two Sum', titleCn: '两数之和', diff: 'Easy', paid: false },
      { id: 2, slug: 'add-two-numbers', title: 'Add Two Numbers', titleCn: '两数相加', diff: 'Medium', paid: false },
    ];
    const out = applyViewPipeline(svc, cn, { term: '两数', difficulty: [], status: [] }, null);
    expect(out.map((x) => x.id)).toEqual([1, 2]);
  });
});

describe('nearBottom', () => {
  it('is true when scrolled to the bottom', () => {
    // scrollHeight 1000, clientHeight 400, scrollTop 600 → exactly at bottom.
    expect(nearBottom({ scrollTop: 600, scrollHeight: 1000, clientHeight: 400 })).toBe(true);
  });

  it('is false when far from the bottom', () => {
    expect(nearBottom({ scrollTop: 0, scrollHeight: 1000, clientHeight: 400 })).toBe(false);
  });

  it('honors a custom threshold', () => {
    const el = { scrollTop: 500, scrollHeight: 1000, clientHeight: 400 }; // 100px away
    expect(nearBottom(el, 200)).toBe(true);
    expect(nearBottom(el, 50)).toBe(false);
  });

  it('is true for a non-scrollable (empty) container', () => {
    expect(nearBottom({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 })).toBe(true);
  });
});

describe('formatIndexAge', () => {
  const NOW = 1_000_000_000_000;
  it('renders the age in escalating units', () => {
    expect(formatIndexAge(NOW - 30 * 1000, NOW)).toBe('刚刚');
    expect(formatIndexAge(NOW - 5 * 60 * 1000, NOW)).toBe('5 分钟前');
    expect(formatIndexAge(NOW - 3 * 60 * 60 * 1000, NOW)).toBe('3 小时前');
    expect(formatIndexAge(NOW - 2 * 24 * 60 * 60 * 1000, NOW)).toBe('2 天前');
  });

  it('clamps future timestamps to 刚刚', () => {
    expect(formatIndexAge(NOW + 60 * 1000, NOW)).toBe('刚刚');
  });
});

describe('countActiveRules', () => {
  it('returns 0 for null and for an empty rules list', () => {
    expect(countActiveRules(null)).toBe(0);
    expect(countActiveRules({ match: 'all', rules: [] })).toBe(0);
  });

  it('excludes no-op rules (empty values / null range bounds)', () => {
    const rules: FilterRule[] = [
      { field: 'status', op: 'is', values: [] },
      { field: 'difficulty', op: 'is', values: ['Easy'] },
      { field: 'question-id', op: 'range', min: null, max: null },
      { field: 'acceptance', op: 'range', min: 0, max: null },
      { field: 'premium', op: 'is', values: [] },
    ];
    expect(countActiveRules({ match: 'all', rules })).toBe(2);
  });
});

describe('collectTopicSlugs', () => {
  it('dedupes and sorts topic slugs across the index', () => {
    expect(collectTopicSlugs(IDX)).toEqual(['array', 'binary-search', 'hash-table', 'linked-list']);
  });

  it('returns an empty array when no row carries topics', () => {
    expect(collectTopicSlugs([p(1, 'Two Sum')])).toEqual([]);
  });
});
