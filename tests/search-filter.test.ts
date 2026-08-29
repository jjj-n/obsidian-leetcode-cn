import { describe, it, expect, beforeEach } from 'vitest';
import { ProblemListService } from '../src/browse/ProblemListService';
import type { IndexedProblem } from '../src/browse/types';

const FIXTURE: IndexedProblem[] = [
  { id: 1, slug: 'two-sum', title: 'Two Sum', diff: 'Easy', paid: false },
  { id: 2, slug: 'add-two-numbers', title: 'Add Two Numbers', diff: 'Medium', paid: false },
  { id: 3, slug: 'longest-substring', title: 'Longest Substring Without Repeating Characters', diff: 'Medium', paid: false },
  { id: 4, slug: 'median-two-sorted', title: 'Median of Two Sorted Arrays', diff: 'Hard', paid: false },
  { id: 12, slug: 'int-to-roman', title: 'Integer to Roman', diff: 'Medium', paid: false },
];

describe('ProblemListService search + filter (BROWSE-03, BROWSE-04 difficulty)', () => {
  let svc: ProblemListService;

  beforeEach(() => {
    // Search and filter are pure methods; client/settings not needed.
    svc = new ProblemListService(null as never, null as never);
  });

  it('search matches title substring case-insensitively', () => {
    const r = svc.search(FIXTURE, 'two');
    // "Two Sum" (id=1), "Add Two Numbers" (id=2), and "Median of Two Sorted Arrays" (id=4)
    // all contain the substring "two" — substring match (not word-boundary) is the
    // documented semantics (Plan 05 <behavior>, BROWSE-03 in RESEARCH.md).
    expect(r.map((p) => p.id).sort((a, b) => a - b)).toEqual([1, 2, 4]);
  });

  it('search matches id prefix', () => {
    const r = svc.search(FIXTURE, '1');
    expect(r.map((p) => p.id).sort((a, b) => a - b)).toEqual([1, 12]);
  });

  it('search returns full list when term empty', () => {
    expect(svc.search(FIXTURE, '')).toEqual(FIXTURE);
  });

  it('search trims whitespace-only term', () => {
    expect(svc.search(FIXTURE, '   ')).toEqual(FIXTURE);
  });

  it('search handles uppercase input', () => {
    const r = svc.search(FIXTURE, 'TWO SUM');
    expect(r.map((p) => p.id)).toEqual([1]);
  });

  it('search matches the Chinese title (titleCn) when present', () => {
    const cn: IndexedProblem[] = [
      { id: 1, slug: 'two-sum', title: 'Two Sum', titleCn: '两数之和', diff: 'Easy', paid: false },
      { id: 146, slug: 'lru-cache', title: 'LRU Cache', titleCn: 'LRU 缓存', diff: 'Medium', paid: false },
      { id: 42, slug: 'trapping-rain-water', title: 'Trapping Rain Water', diff: 'Hard', paid: false },
    ];
    expect(svc.search(cn, '两数')).toEqual([cn[0]]);
    expect(svc.search(cn, '缓存')).toEqual([cn[1]]);
    // English still matches rows that carry a titleCn.
    expect(svc.search(cn, 'two')).toEqual([cn[0]]);
    // Rows without titleCn are unaffected.
    expect(svc.search(cn, 'rain')).toEqual([cn[2]]);
  });

  it('filter by single difficulty (Easy)', () => {
    const r = svc.filter(FIXTURE, { difficulty: ['Easy'] });
    expect(r.map((p) => p.id)).toEqual([1]);
  });

  it('filter by multiple difficulties (Easy + Hard)', () => {
    const r = svc.filter(FIXTURE, { difficulty: ['Easy', 'Hard'] });
    expect(r.map((p) => p.id).sort((a, b) => a - b)).toEqual([1, 4]);
  });

  it('filter with empty opts returns full list', () => {
    expect(svc.filter(FIXTURE, {})).toEqual(FIXTURE);
  });

  it('filter with empty difficulty array returns full list', () => {
    expect(svc.filter(FIXTURE, { difficulty: [] })).toEqual(FIXTURE);
  });
});
