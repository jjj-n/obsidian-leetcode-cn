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
      topicTags { name slug translatedName }
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
      topicTags?: Array<{ name: string; slug: string; translatedName?: string | null }>;
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
    topicTags: (q.topicTags ?? []).map((t) => ({
      ...t,
      translatedName: t.translatedName ?? null,
    })),
    codeSnippets: q.codeSnippets ?? [],
    stats: q.stats,
  };
}

/** One search hit from cn server-side problem search (problemsetQuestionList). */
export interface CNProblemSearchHit {
  /** Display id, e.g. "1" / "LCR 007" / "面试题 17.09". */
  frontendId: string;
  /** English title ("Two Sum"). */
  title: string;
  /** Chinese title ("两数之和") — empty string when LC omitted it. */
  titleCn: string;
  slug: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

const SEARCH_QUERY = `
  query search($filters: QuestionListFilterInput, $limit: Int, $skip: Int) {
    problemsetQuestionList(filters: $filters, limit: $limit, skip: $skip) {
      total
      questions { frontendQuestionId title titleSlug titleCn difficulty }
    }
  }
`;

interface SearchQueryResponse {
  data?: {
    problemsetQuestionList?: {
      total?: number;
      questions?: Array<{
        frontendQuestionId?: string;
        title?: string;
        titleSlug?: string;
        titleCn?: string | null;
        // This endpoint returns UPPERCASE difficulty — normalized below.
        difficulty?: string;
      }>;
    } | null;
  };
}

/** Map the list endpoint's UPPERCASE difficulty onto the plugin-wide vocabulary. */
function normalizeListDifficulty(d: string | undefined): 'Easy' | 'Medium' | 'Hard' {
  if (d === 'EASY' || d === 'Easy') return 'Easy';
  if (d === 'HARD' || d === 'Hard') return 'Hard';
  return 'Medium';
}

/**
 * Server-side problem search on leetcode.cn — the same `searchKeywords`
 * filter the website's problem-set search box uses. Matches BOTH the Chinese
 * title (titleCn) and the English title, so "两数之和", "climbing", and
 * partial titles all work. One request, no local index needed. Works
 * anonymously for public problems.
 */
export async function fetchCNProblemSearch(
  lcCN: InstanceType<typeof LeetCodeCN>,
  keyword: string,
  limit = 20,
): Promise<CNProblemSearchHit[]> {
  const resp = await lcCN.graphql({
    query: SEARCH_QUERY,
    variables: {
      filters: { searchKeywords: keyword },
      limit,
      skip: 0,
    },
  }) as SearchQueryResponse;

  const rows = resp?.data?.problemsetQuestionList?.questions ?? [];
  return rows
    .filter((r) => typeof r.titleSlug === 'string' && r.titleSlug.length > 0)
    .map((r) => ({
      frontendId: r.frontendQuestionId ?? '',
      title: r.title ?? '',
      titleCn: typeof r.titleCn === 'string' ? r.titleCn : '',
      slug: r.titleSlug as string,
      difficulty: normalizeListDifficulty(r.difficulty),
    }));
}
