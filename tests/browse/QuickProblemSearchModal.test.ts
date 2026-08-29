// tests/browse/QuickProblemSearchModal.test.ts
//
// Pure-logic unit tests for the quick-search filter. The modal's
// SuggestModal subclass delegates suggestion ranking to `filterProblems`,
// keeping the ranking logic decoupled from happy-dom DOM construction.
import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', async () => await import('../helpers/obsidian-stub'));

import { filterProblems, QUICK_SEARCH_LIMIT } from '../../src/browse/QuickProblemSearchModal';
import type { IndexedProblem } from '../../src/browse/types';

function p(id: number, slug: string, title: string, diff: 'Easy' | 'Medium' | 'Hard' = 'Easy'): IndexedProblem {
  return { id, slug, title, diff, paid: false };
}

const FIXTURE: IndexedProblem[] = [
  p(1, 'two-sum', 'Two Sum'),
  p(2, 'add-two-numbers', 'Add Two Numbers', 'Medium'),
  p(3, 'longest-substring-without-repeating-characters', 'Longest Substring Without Repeating Characters', 'Medium'),
  p(42, 'trapping-rain-water', 'Trapping Rain Water', 'Hard'),
  p(420, 'count-numbers-with-unique-digits', 'Count Numbers with Unique Digits', 'Medium'),
  p(125, 'valid-palindrome', 'Valid Palindrome'),
];

describe('filterProblems', () => {
  it('returns the first `limit` problems when query is empty', () => {
    const out = filterProblems(FIXTURE, '', 3);
    expect(out).toHaveLength(3);
    expect(out.map((x) => x.id)).toEqual([1, 2, 3]);
  });

  it('returns the first `limit` problems when query is whitespace-only', () => {
    const out = filterProblems(FIXTURE, '   ', 4);
    expect(out).toHaveLength(4);
    expect(out.map((x) => x.id)).toEqual([1, 2, 3, 42]);
  });

  it('honors the default limit of 50 when no limit is passed', () => {
    expect(QUICK_SEARCH_LIMIT).toBe(50);
    const big: IndexedProblem[] = Array.from({ length: 80 }, (_, i) => p(i + 1, `slug-${i}`, `Title ${i}`));
    const out = filterProblems(big, '');
    expect(out).toHaveLength(50);
  });

  it('ranks exact-id match before id-prefix matches', () => {
    const out = filterProblems(FIXTURE, '42');
    // 42 is the exact match; 420 is the id-prefix match — exact must come first.
    const ids = out.map((x) => x.id);
    expect(ids[0]).toBe(42);
    expect(ids[1]).toBe(420);
  });

  it('matches title substring case-insensitively', () => {
    // 'TWO' lowered → 'two' — substring of both "Two Sum" and "Add Two Numbers".
    const out = filterProblems(FIXTURE, 'TWO');
    expect(out.map((x) => x.id)).toContain(1);
    expect(out.map((x) => x.id)).toContain(2);
    // 'two SUM' (with the literal space) only substring-matches "Two Sum".
    const tighter = filterProblems(FIXTURE, 'two SUM');
    expect(tighter.map((x) => x.id)).toEqual([1]);
  });

  it('matches slug substring', () => {
    const out = filterProblems(FIXTURE, 'palindrome');
    expect(out.map((x) => x.id)).toEqual([125]);
  });

  it('matches the Chinese title (titleCn) and keeps English matching alongside', () => {
    const cn: IndexedProblem[] = [
      { id: 1, slug: 'two-sum', title: 'Two Sum', titleCn: '两数之和', diff: 'Easy', paid: false },
      { id: 2, slug: 'add-two-numbers', title: 'Add Two Numbers', titleCn: '两数相加', diff: 'Medium', paid: false },
      { id: 42, slug: 'trapping-rain-water', title: 'Trapping Rain Water', diff: 'Hard', paid: false },
    ];
    expect(filterProblems(cn, '两数').map((x) => x.id)).toEqual([1, 2]);
    expect(filterProblems(cn, 'two').map((x) => x.id)).toEqual([1, 2]);
    expect(filterProblems(cn, '两数之和').map((x) => x.id)).toEqual([1]);
  });

  it('returns empty array when nothing matches', () => {
    const out = filterProblems(FIXTURE, 'no-such-problem-xyz');
    expect(out).toEqual([]);
  });

  it('caps results at the supplied limit on text matches', () => {
    const big: IndexedProblem[] = Array.from({ length: 100 }, (_, i) => p(i + 1, `xyz-${i}`, `Xyz ${i}`));
    const out = filterProblems(big, 'xyz', 7);
    expect(out).toHaveLength(7);
  });
});
