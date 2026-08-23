// tests/ui/fetch-input-routing.test.ts
// Fetch problem 输入路由（classifyFetchInput）与搜索结果二次筛选
// （filterSearchHits）——两个纯函数，覆盖中文/英文/数字/URL/slug 各分支。
import { describe, it, expect } from 'vitest';
import { classifyFetchInput, parseProblemSlug } from '../../src/ui/FetchProblemModal';
import { filterSearchHits } from '../../src/ui/ProblemSearchResultModal';
import type { CNProblemSearchHit } from '../../src/api/LeetCodeCNAdapter';

describe('classifyFetchInput', () => {
  it('routes URLs and slug-shaped text to direct slug fetch', () => {
    expect(classifyFetchInput('https://leetcode.cn/problems/two-sum/description/'))
      .toEqual({ kind: 'slug', slug: 'two-sum' });
    expect(classifyFetchInput('two-sum')).toEqual({ kind: 'slug', slug: 'two-sum' });
    expect(classifyFetchInput('3sum')).toEqual({ kind: 'slug', slug: '3sum' });
  });

  it('routes Chinese titles to search', () => {
    expect(classifyFetchInput('两数之和')).toEqual({ kind: 'search', query: '两数之和' });
    expect(classifyFetchInput('  爬楼梯  ')).toEqual({ kind: 'search', query: '爬楼梯' });
  });

  it('routes English keywords with spaces to search', () => {
    expect(classifyFetchInput('climbing stairs')).toEqual({ kind: 'search', query: 'climbing stairs' });
  });

  it('routes pure digits to search (LC slugs are never bare numbers)', () => {
    expect(classifyFetchInput('70')).toEqual({ kind: 'search', query: '70' });
  });

  it('routes empty/whitespace input to empty', () => {
    expect(classifyFetchInput('')).toEqual({ kind: 'empty' });
    expect(classifyFetchInput('   ')).toEqual({ kind: 'empty' });
  });

  it('parseProblemSlug stays null for Chinese and spaced input (search handles those)', () => {
    expect(parseProblemSlug('两数之和')).toBeNull();
    expect(parseProblemSlug('climbing stairs')).toBeNull();
  });
});

describe('filterSearchHits', () => {
  const hits: CNProblemSearchHit[] = [
    { frontendId: '1', title: 'Two Sum', titleCn: '两数之和', slug: 'two-sum', difficulty: 'Easy' },
    { frontendId: '70', title: 'Climbing Stairs', titleCn: '爬楼梯', slug: 'climbing-stairs', difficulty: 'Easy' },
    { frontendId: 'LCR 007', title: '三数之和', titleCn: '三数之和', slug: '3sum-lcr', difficulty: 'Medium' },
  ];

  it('empty query returns the server-ranked hits unchanged', () => {
    expect(filterSearchHits(hits, '')).toEqual(hits);
  });

  it('matches across 题号 / 中文题名 / 英文题名 / slug, case-insensitively', () => {
    expect(filterSearchHits(hits, '爬')[0]!.slug).toBe('climbing-stairs');
    expect(filterSearchHits(hits, '70')[0]!.slug).toBe('climbing-stairs');
    expect(filterSearchHits(hits, 'TWO')[0]!.slug).toBe('two-sum');
    expect(filterSearchHits(hits, 'climbing-stairs')[0]!.slug).toBe('climbing-stairs');
  });

  it('caps results at the limit', () => {
    expect(filterSearchHits(hits, '', 2)).toHaveLength(2);
  });
});
