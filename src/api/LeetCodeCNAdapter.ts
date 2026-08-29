// src/api/LeetCodeCNAdapter.ts
// Ticket #3 — thin cn problem-fetch adapter over LeetCodeCN.graphql().
// LeetCodeCN (from @leetnotion/leetcode-api) only provides transport + user();
// problem() / whoami() / submissions() live on the .com-only LeetCode class.
// This adapter re-issues the same problem query through the cn transport,
// preferring translatedContent (Chinese) over content (English).
import type { LeetCodeCN } from '@leetnotion/leetcode-api';
import type { LeetCodeProblemDetail, ProblemListPage } from './LeetCodeClient';

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

// Full-index pagination over the same problemsetQuestionList endpoint as
// SEARCH_QUERY, but WITHOUT searchKeywords (filters: {} = the whole problemset)
// and with the extra index fields. Smoke-verified against leetcode.cn (2026-08):
// - the node type is QuestionLightNode — `paidOnly`, NOT `isPaidOnly` (400s);
// - `status` uses the cn enum SOLVED / ATTEMPTED / NOT_STARTED (NOT ac/notac),
//   and NOT_STARTED for anonymous requests;
// - `acRate` is a 0-1 fraction (0.5521…), normalized to 0-100 below;
// - `total` covers the whole cn problemset (~4400 incl. LCR/LCCI books).
// Drives ProblemListService.refresh for the problem browser.
const INDEX_QUERY = `
  query problemList($filters: QuestionListFilterInput, $limit: Int, $skip: Int) {
    problemsetQuestionList(filters: $filters, limit: $limit, skip: $skip) {
      total
      questions {
        frontendQuestionId title titleSlug titleCn difficulty
        status acRate paidOnly
        topicTags { slug }
      }
    }
  }
`;

interface IndexQueryResponse {
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
        // cn enum on QuestionLightNode — mapped onto the .com 'ac'/'notac' vocabulary.
        status?: 'SOLVED' | 'ATTEMPTED' | 'NOT_STARTED' | null;
        /** 0-1 fraction on cn (smoke-verified) — multiplied by 100 below. */
        acRate?: number;
        paidOnly?: boolean;
        topicTags?: Array<{ slug?: string }>;
      }>;
    } | null;
  };
}

/** Map cn's list status enum onto the shared 'ac' | 'notac' | null vocabulary
 *  (matching what .com's problemsetQuestionList returns natively). */
function mapCNListStatus(
  s: 'SOLVED' | 'ATTEMPTED' | 'NOT_STARTED' | null | undefined,
): 'ac' | 'notac' | null {
  if (s === 'SOLVED') return 'ac';
  if (s === 'ATTEMPTED') return 'notac';
  return null;
}

/** Fetch ONE page of the full leetcode.cn problemset (limit/skip pagination).
 *  Same normalization posture as fetchCNProblemSearch: UPPERCASE difficulty
 *  normalized, null titleCn → '', slug-less rows dropped. `status` is null when
 *  not signed in (cn reports NOT_STARTED for anonymous requests). */
export async function fetchCNProblemListPage(
  lcCN: InstanceType<typeof LeetCodeCN>,
  opts: { limit: number; skip: number },
): Promise<ProblemListPage> {
  const resp = await lcCN.graphql({
    query: INDEX_QUERY,
    variables: {
      filters: {},
      limit: opts.limit,
      skip: opts.skip,
    },
  }) as IndexQueryResponse;

  const list = resp?.data?.problemsetQuestionList;
  const questions = (list?.questions ?? [])
    .filter((r) => typeof r.titleSlug === 'string' && r.titleSlug.length > 0)
    .map((r) => ({
      questionFrontendId: r.frontendQuestionId ?? '',
      titleSlug: r.titleSlug as string,
      title: r.title ?? '',
      titleCn: typeof r.titleCn === 'string' ? r.titleCn : '',
      difficulty: normalizeListDifficulty(r.difficulty),
      isPaidOnly: r.paidOnly === true,
      status: mapCNListStatus(r.status),
      acRate: typeof r.acRate === 'number' ? r.acRate * 100 : undefined,
      topicTags: Array.isArray(r.topicTags) ? r.topicTags : undefined,
    }));
  return {
    questions,
    total: typeof list?.total === 'number' ? list.total : null,
  };
}
