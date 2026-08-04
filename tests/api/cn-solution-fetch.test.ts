// tests/api/cn-solution-fetch.test.ts
// Ticket #4: 题解 adapter tests — fetch official + community solutions
// and URL parsing.
import { describe, it, expect, vi } from 'vitest';
import {
  fetchCNOfficialSolution,
  fetchCNCommunitySolution,
  parseCNSolutionUrl,
} from '../../src/api/LeetCodeCNSolutionAdapter';

function makeMockLCClient(result: unknown) {
  return { graphql: vi.fn(async () => result) };
}

describe('fetchCNOfficialSolution', () => {
  it('returns solution when present', async () => {
    const lc = makeMockLCClient({
      data: { question: { solution: { title: '两数之和', content: '## 方法一\nblah' } } },
    });
    const result = await fetchCNOfficialSolution(lc as never, 'two-sum');
    expect(result).toEqual({ title: '两数之和', content: '## 方法一\nblah' });
  });

  it('returns null when no solution field', async () => {
    const lc = makeMockLCClient({ data: { question: { solution: null } } });
    const result = await fetchCNOfficialSolution(lc as never, 'two-sum');
    expect(result).toBeNull();
  });

  it('returns null when content is empty', async () => {
    const lc = makeMockLCClient({
      data: { question: { solution: { title: 'X', content: '' } } },
    });
    const result = await fetchCNOfficialSolution(lc as never, 'two-sum');
    expect(result).toBeNull();
  });
});

describe('fetchCNCommunitySolution', () => {
  it('returns article when present', async () => {
    const lc = makeMockLCClient({
      data: { solutionArticle: { title: '暴力法', content: '<p>思路</p>' } },
    });
    const result = await fetchCNCommunitySolution(lc as never, 'article-slug-123');
    expect(result).toEqual({ title: '暴力法', content: '<p>思路</p>' });
  });

  it('returns null when article not found', async () => {
    const lc = makeMockLCClient({ data: { solutionArticle: null } });
    const result = await fetchCNCommunitySolution(lc as never, 'nonexistent');
    expect(result).toBeNull();
  });
});

describe('parseCNSolutionUrl', () => {
  it('parses official solution URL', () => {
    const result = parseCNSolutionUrl('https://leetcode.cn/problems/two-sum/solution/');
    expect(result).toEqual({ problemSlug: 'two-sum', type: 'official' });
  });

  it('parses official solution URL without trailing slash', () => {
    const result = parseCNSolutionUrl('https://leetcode.cn/problems/two-sum/solution');
    expect(result).toEqual({ problemSlug: 'two-sum', type: 'official' });
  });

  it('parses community solution URL', () => {
    const result = parseCNSolutionUrl(
      'https://leetcode.cn/problems/two-sum/solutions/12345/bao-li-fa/',
    );
    expect(result).toEqual({
      problemSlug: 'two-sum',
      type: 'community',
      articleSlug: 'bao-li-fa',
    });
  });

  it('parses community URL with query params', () => {
    const result = parseCNSolutionUrl(
      'https://leetcode.cn/problems/two-sum/solutions/12345/bao-li-fa/?envType=daily',
    );
    expect(result).toEqual({
      problemSlug: 'two-sum',
      type: 'community',
      articleSlug: 'bao-li-fa',
    });
  });

  it('returns null for non-leetcode URL', () => {
    expect(parseCNSolutionUrl('https://example.com/problems/two-sum/')).toBeNull();
  });

  it('returns null for leetcode.com (not cn)', () => {
    expect(parseCNSolutionUrl('https://leetcode.com/problems/two-sum/solution/')).toBeNull();
  });

  it('returns null for generic problem URL (no solution path)', () => {
    expect(parseCNSolutionUrl('https://leetcode.cn/problems/two-sum/')).toBeNull();
  });
});
