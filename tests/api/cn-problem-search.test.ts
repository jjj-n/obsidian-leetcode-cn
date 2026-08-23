// tests/api/cn-problem-search.test.ts
// cn server-side problem search (problemsetQuestionList + searchKeywords).
// Verifies the GraphQL variables carry the keyword inside `filters`, that
// UPPERCASE list difficulties are normalized, and that rows without a slug
// are dropped.
import { describe, it, expect, vi } from 'vitest';
import { fetchCNProblemSearch } from '../../src/api/LeetCodeCNAdapter';

function makeMockLCClient(result: unknown) {
  return {
    graphql: vi.fn(async () => result),
  };
}

function fakeSearchResponse() {
  return {
    data: {
      problemsetQuestionList: {
        total: 3,
        questions: [
          {
            frontendQuestionId: '1',
            title: 'Two Sum',
            titleSlug: 'two-sum',
            titleCn: '两数之和',
            difficulty: 'EASY',
          },
          {
            frontendQuestionId: 'LCR 007',
            title: '三数之和',
            titleSlug: '3sum-lcr',
            titleCn: '三数之和',
            difficulty: 'MEDIUM',
          },
          {
            // Malformed row (no slug) — must be filtered out, not crash.
            frontendQuestionId: 'X',
            title: 'No slug',
            titleSlug: '',
            difficulty: 'HARD',
          },
        ],
      },
    },
  };
}

describe('fetchCNProblemSearch', () => {
  it('sends the keyword inside filters.searchKeywords', async () => {
    const lc = makeMockLCClient(fakeSearchResponse());
    await fetchCNProblemSearch(lc as never, '两数之和', 20);
    expect(lc.graphql).toHaveBeenCalledWith(expect.objectContaining({
      variables: {
        filters: { searchKeywords: '两数之和' },
        limit: 20,
        skip: 0,
      },
    }));
  });

  it('maps rows: slug-ful rows kept, difficulty normalized, titleCn defaulted', async () => {
    const lc = makeMockLCClient(fakeSearchResponse());
    const hits = await fetchCNProblemSearch(lc as never, '两数之和', 20);
    expect(hits).toEqual([
      { frontendId: '1', title: 'Two Sum', titleCn: '两数之和', slug: 'two-sum', difficulty: 'Easy' },
      { frontendId: 'LCR 007', title: '三数之和', titleCn: '三数之和', slug: '3sum-lcr', difficulty: 'Medium' },
    ]);
  });

  it('treats a missing/null titleCn as empty string', async () => {
    const lc = makeMockLCClient({
      data: {
        problemsetQuestionList: {
          questions: [{ frontendQuestionId: '1', title: 'Two Sum', titleSlug: 'two-sum', titleCn: null, difficulty: 'EASY' }],
        },
      },
    });
    const hits = await fetchCNProblemSearch(lc as never, 'two', 20);
    expect(hits[0]!.titleCn).toBe('');
  });

  it('returns [] when the response has no questions', async () => {
    const lc = makeMockLCClient({ data: { problemsetQuestionList: null } });
    const hits = await fetchCNProblemSearch(lc as never, 'zzz', 20);
    expect(hits).toEqual([]);
  });
});
