// src/api/LeetCodeCNAdapter.ts
// Ticket #3 — thin cn problem-fetch adapter over LeetCodeCN.graphql().
// LeetCodeCN (from @leetnotion/leetcode-api) only provides transport + user();
// problem() / whoami() / submissions() live on the .com-only LeetCode class.
// This adapter re-issues the same problem query through the cn transport,
// preferring translatedContent (Chinese) over content (English).
import type { LeetCodeCN } from '@leetnotion/leetcode-api';
import type { LeetCodeProblemDetail } from './LeetCodeClient';

const PROBLEM_QUERY = `
  query problem($titleSlug: String!) {
    question(titleSlug: $titleSlug) {
      questionFrontendId
      questionId
      title
      titleSlug
      content
      translatedTitle
      translatedContent
      difficulty
      isPaidOnly
      exampleTestcases
      metaData
      sampleTestCase
      stats
      topicTags { name slug }
      codeSnippets { lang langSlug code }
    }
  }
`;

interface ProblemQueryResponse {
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

/** Fetch a problem detail from leetcode.cn via LeetCodeCN.graphql().
 *  Prefers `translatedContent` (Chinese) over `content` (English) so
 *  cn users see the Chinese problem statement by default. */
export async function fetchCNProblemDetail(
  lcCN: InstanceType<typeof LeetCodeCN>,
  slug: string,
): Promise<LeetCodeProblemDetail | null> {
  const resp = await lcCN.graphql({
    query: PROBLEM_QUERY,
    variables: { titleSlug: slug },
  }) as ProblemQueryResponse;

  const q = resp?.data?.question;
  if (!q || !q.questionFrontendId) return null;

  return {
    questionFrontendId: q.questionFrontendId,
    questionId: q.questionId ?? undefined,
    titleSlug: q.titleSlug ?? slug,
    title: q.title ?? '',
    translatedTitle: q.translatedTitle ?? null,
    content: q.translatedContent ?? q.content ?? null,
    difficulty: q.difficulty ?? 'Easy',
    isPaidOnly: q.isPaidOnly ?? false,
    exampleTestcases: q.exampleTestcases,
    metaData: q.metaData,
    sampleTestCase: q.sampleTestCase,
    topicTags: q.topicTags ?? [],
    codeSnippets: q.codeSnippets ?? [],
    stats: q.stats,
  };
}
