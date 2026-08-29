// tests/api/cn-problem-list-page.test.ts
// cn full-index pagination (problemsetQuestionList without searchKeywords).
// Field spellings and value ranges below are smoke-verified against
// leetcode.cn (2026-08): `paidOnly` (not isPaidOnly), status enum
// SOLVED/ATTEMPTED/NOT_STARTED, acRate as a 0-1 fraction.
import { describe, it, expect, vi } from 'vitest';
import { fetchCNProblemListPage } from '../../src/api/LeetCodeCNAdapter';

function makeMockLCClient(result: unknown) {
  return {
    graphql: vi.fn(async () => result),
  };
}

describe('fetchCNProblemListPage', () => {
  it('paginates with empty filters and passes limit/skip through', async () => {
    const lc = makeMockLCClient({ data: { problemsetQuestionList: { total: 4421, questions: [] } } });
    await fetchCNProblemListPage(lc as never, { limit: 50, skip: 100 });
    expect(lc.graphql).toHaveBeenCalledWith(expect.objectContaining({
      variables: {
        filters: {},
        limit: 50,
        skip: 100,
      },
    }));
  });

  it('maps the extended index fields onto ProblemListRow', async () => {
    const lc = makeMockLCClient({
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
              status: 'SOLVED',
              acRate: 0.5521854694580441,
              paidOnly: false,
              topicTags: [{ slug: 'array' }, { slug: 'hash-table' }],
            },
            {
              frontendQuestionId: '面试题 17.09',
              title: 'Get Kth Magic Number LCCI',
              titleSlug: 'get-kth-magic-number-lcci',
              titleCn: null,
              difficulty: 'MEDIUM',
              status: 'ATTEMPTED',
              paidOnly: true,
            },
            {
              frontendQuestionId: '2',
              title: 'Add Two Numbers',
              titleSlug: 'add-two-numbers',
              titleCn: '两数相加',
              difficulty: 'MEDIUM',
              status: 'NOT_STARTED', // anonymous shape — maps to null
              paidOnly: false,
            },
          ],
        },
      },
    });
    const page = await fetchCNProblemListPage(lc as never, { limit: 50, skip: 0 });

    expect(page.total).toBe(3);
    // cn status enum → shared vocabulary: SOLVED→ac, ATTEMPTED→notac, NOT_STARTED→null.
    expect(page.questions[0]).toEqual({
      questionFrontendId: '1',
      titleSlug: 'two-sum',
      title: 'Two Sum',
      titleCn: '两数之和',
      difficulty: 'Easy',
      isPaidOnly: false,
      status: 'ac',
      acRate: 55.21854694580441, // 0-1 fraction × 100
      topicTags: [{ slug: 'array' }, { slug: 'hash-table' }],
    });
    expect(page.questions[1]).toEqual({
      questionFrontendId: '面试题 17.09',
      titleSlug: 'get-kth-magic-number-lcci',
      title: 'Get Kth Magic Number LCCI',
      titleCn: '',
      difficulty: 'Medium',
      isPaidOnly: true,
      status: 'notac',
      acRate: undefined,
      topicTags: undefined,
    });
    expect(page.questions[2]).toMatchObject({ status: null, titleCn: '两数相加' });
  });

  it('drops rows without a slug', async () => {
    const lc = makeMockLCClient({
      data: {
        problemsetQuestionList: {
          total: 2,
          questions: [
            { frontendQuestionId: '1', title: 'Two Sum', titleSlug: 'two-sum',
              difficulty: 'EASY', status: 'NOT_STARTED' },
            // Malformed row (empty slug) — must be filtered out, not crash.
            { frontendQuestionId: 'X', title: 'No slug', titleSlug: '', difficulty: 'HARD' },
          ],
        },
      },
    });
    const page = await fetchCNProblemListPage(lc as never, { limit: 50, skip: 0 });
    expect(page.questions).toHaveLength(1);
    expect(page.questions[0]?.titleSlug).toBe('two-sum');
  });

  it('normalizes unrecognized status values to null and passes total through', async () => {
    const lc = makeMockLCClient({
      data: {
        problemsetQuestionList: {
          total: 4421,
          questions: [
            { frontendQuestionId: '1', title: 'Two Sum', titleSlug: 'two-sum',
              difficulty: 'EASY', status: 'weird-future-value' },
          ],
        },
      },
    });
    const page = await fetchCNProblemListPage(lc as never, { limit: 50, skip: 0 });
    expect(page.questions[0]?.status).toBeNull();
    expect(page.total).toBe(4421);
  });

  it('returns an empty page with null total when the response is null', async () => {
    const lc = makeMockLCClient({ data: { problemsetQuestionList: null } });
    const page = await fetchCNProblemListPage(lc as never, { limit: 50, skip: 0 });
    expect(page.questions).toEqual([]);
    expect(page.total).toBeNull();
  });
});
