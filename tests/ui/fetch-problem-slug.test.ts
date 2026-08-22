// tests/ui/fetch-problem-slug.test.ts
// Unit tests for the core-loop input parser: URL / bare-slug → slug.

import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', async () => await import('../helpers/obsidian-stub'));

import { parseProblemSlug } from '../../src/ui/FetchProblemModal';

describe('parseProblemSlug', () => {
  // ── URL forms ────────────────────────────────────────────────────────
  it('parses a bare leetcode.cn problem URL', () => {
    expect(parseProblemSlug('https://leetcode.cn/problems/two-sum/')).toBe('two-sum');
  });

  it('parses a URL without trailing slash', () => {
    expect(parseProblemSlug('https://leetcode.cn/problems/two-sum')).toBe('two-sum');
  });

  it('parses /description/ subpaths', () => {
    expect(parseProblemSlug('https://leetcode.cn/problems/median-of-two-sorted-arrays/description/')).toBe('median-of-two-sorted-arrays');
  });

  it('parses /solutions/ subpaths (user pasted a solution page)', () => {
    expect(parseProblemSlug('https://leetcode.cn/problems/two-sum/solutions/1234/some-article/')).toBe('two-sum');
  });

  it('parses leetcode.com URLs leniently (slugs are shared for most problems)', () => {
    expect(parseProblemSlug('https://leetcode.com/problems/trapping-rain-water/')).toBe('trapping-rain-water');
  });

  it('lowercases an uppercased URL slug', () => {
    expect(parseProblemSlug('https://leetcode.cn/problems/Two-Sum/')).toBe('two-sum');
  });

  it('rejects a problems URL with no slug', () => {
    expect(parseProblemSlug('https://leetcode.cn/problems/')).toBeNull();
  });

  it('rejects unrelated leetcode.cn URLs', () => {
    expect(parseProblemSlug('https://leetcode.cn/studyplan/top-interview-150/')).toBeNull();
  });

  // ── Bare slug forms ──────────────────────────────────────────────────
  it('accepts a bare slug', () => {
    expect(parseProblemSlug('two-sum')).toBe('two-sum');
  });

  it('accepts slugs with digits and hyphens', () => {
    expect(parseProblemSlug('3sum')).toBe('3sum');
    expect(parseProblemSlug('binary-tree-inorder-traversal')).toBe('binary-tree-inorder-traversal');
  });

  it('lowercases a bare slug', () => {
    expect(parseProblemSlug('Two-Sum')).toBe('two-sum');
  });

  it('trims surrounding whitespace', () => {
    expect(parseProblemSlug('  two-sum  ')).toBe('two-sum');
  });

  // ── Invalid forms ────────────────────────────────────────────────────
  it('rejects empty and whitespace-only input', () => {
    expect(parseProblemSlug('')).toBeNull();
    expect(parseProblemSlug('   ')).toBeNull();
  });

  it('rejects slugs with invalid characters (spaces, underscores, CJK)', () => {
    expect(parseProblemSlug('two sum')).toBeNull();
    expect(parseProblemSlug('two_sum')).toBeNull();
    expect(parseProblemSlug('两数之和')).toBeNull();
  });
});
