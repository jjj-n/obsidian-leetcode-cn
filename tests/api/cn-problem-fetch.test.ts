// tests/api/cn-problem-fetch.test.ts
// Ticket #3: cn problem fetch adapter.
// Tests that fetchCNProblemDetail issues the correct GraphQL query
// and prefers translatedContent over content.
import { describe, it, expect, vi } from 'vitest';
import { fetchCNProblemDetail } from '../../src/api/LeetCodeCNAdapter';
import type { LeetCodeProblemDetail } from '../../src/api/LeetCodeClient';

// Minimal stub of LeetCodeCN.graphql() — we only need the method shape.
interface GraphQLResult {
  data?: {
    question?: {
      questionFrontendId?: string;
      questionId?: string | null;
      title?: string;
      titleSlug?: string;
      content?: string | null;
      translatedTitle?: string | null;
      translatedContent?: string | null;
      difficulty?: 'Easy' | 'Medium' | 'Hard';
      isPaidOnly?: boolean;
      exampleTestcases?: string;
      metaData?: string;
      sampleTestCase?: string;
      stats?: string;
      topicTags?: Array<{ name: string; slug: string }>;
      codeSnippets?: Array<{ lang: string; langSlug: string; code: string }>;
    } | null;
  };
}

function makeMockLCClient(result: GraphQLResult) {
  return {
    graphql: vi.fn(async () => result),
  };
}

function fakeCNProblem(overrides: Partial<NonNullable<GraphQLResult['data']>['question']> = {}) {
  return {
    questionFrontendId: '1',
    questionId: '1',
    title: 'Two Sum',
    titleSlug: 'two-sum',
    content: '<p>English content</p>',
    translatedTitle: '两数之和',
    translatedContent: '<p>中文题面</p>',
    difficulty: 'Easy' as const,
    isPaidOnly: false,
    topicTags: [{ name: 'Array', slug: 'array' }],
    codeSnippets: [{ lang: 'Python3', langSlug: 'python3', code: 'class Solution:' }],
    ...overrides,
  };
}

describe('fetchCNProblemDetail', () => {
  it('returns null when LC returns no question', async () => {
    const lc = makeMockLCClient({ data: { question: null } });
    const result = await fetchCNProblemDetail(lc as never, 'two-sum');
    expect(result).toBeNull();
  });

  it('returns null when questionFrontendId is missing', async () => {
    const lc = makeMockLCClient({
      data: { question: { questionFrontendId: '', title: 'X' } },
    });
    const result = await fetchCNProblemDetail(lc as never, 'two-sum');
    expect(result).toBeNull();
  });

  it('prefers translatedContent over content', async () => {
    const lc = makeMockLCClient({
      data: { question: fakeCNProblem() },
    });
    const result = await fetchCNProblemDetail(lc as never, 'two-sum');
    expect(result).not.toBeNull();
    expect(result!.content).toBe('<p>中文题面</p>');
  });

  it('falls back to content when translatedContent is null', async () => {
    const lc = makeMockLCClient({
      data: { question: fakeCNProblem({ translatedContent: null }) },
    });
    const result = await fetchCNProblemDetail(lc as never, 'two-sum');
    expect(result).not.toBeNull();
    expect(result!.content).toBe('<p>English content</p>');
  });

  it('passes the correct slug variable to graphql', async () => {
    // Use any-typed spy so we can access mock.calls without narrowing.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const graphqlSpy: any = vi.fn(async () => ({ data: { question: fakeCNProblem() } }));
    const lc = { graphql: graphqlSpy };
    await fetchCNProblemDetail(lc as never, 'three-sum');
    expect(graphqlSpy).toHaveBeenCalledTimes(1);
    const call = graphqlSpy.mock.calls[0][0];
    expect(call.variables).toEqual({ titleSlug: 'three-sum' });
  });

  it('maps all fields correctly', async () => {
    const lc = makeMockLCClient({
      data: {
        question: fakeCNProblem({
          questionId: '42',
          exampleTestcases: '[2,7,11,15]\n9',
          metaData: '{"params":[{"name":"nums","type":"integer[]"}]}',
          sampleTestCase: '2\n7\n11\n15',
          stats: '{"acRate":"50%"}"',
        }),
      },
    });
    const result = await fetchCNProblemDetail(lc as never, 'two-sum');
    expect(result).toEqual({
      questionFrontendId: '1',
      questionId: '42',
      titleSlug: 'two-sum',
      title: 'Two Sum',
      content: '<p>中文题面</p>',
      difficulty: 'Easy',
      isPaidOnly: false,
      exampleTestcases: '[2,7,11,15]\n9',
      metaData: '{"params":[{"name":"nums","type":"integer[]"}]}',
      sampleTestCase: '2\n7\n11\n15',
      stats: '{"acRate":"50%"}"',
      topicTags: [{ name: 'Array', slug: 'array' }],
      codeSnippets: [{ lang: 'Python3', langSlug: 'python3', code: 'class Solution:' }],
    });
  });
});
