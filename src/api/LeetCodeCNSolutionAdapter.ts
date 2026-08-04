// src/api/LeetCodeCNSolutionAdapter.ts
// Ticket #4 — cn 题解 article fetch adapter over LeetCodeCN.graphql().
// Handles both official (question.solution) and community (solutionArticle) paths.
import type { LeetCodeCN } from '@leetnotion/leetcode-api';

export interface SolutionArticle {
  title: string;
  content: string;
}

const OFFICIAL_SOLUTION_QUERY = `
  query officialSolution($titleSlug: String!) {
    question(titleSlug: $titleSlug) {
      solution { title content }
    }
  }
`;

const COMMUNITY_SOLUTION_QUERY = `
  query communitySolution($slug: String!) {
    solutionArticle(slug: $slug) { title content }
  }
`;

/** Fetch the official cn editorial for a problem slug.
 *  Returns null when LC has no official solution for this problem. */
export async function fetchCNOfficialSolution(
  lcCN: InstanceType<typeof LeetCodeCN>,
  titleSlug: string,
): Promise<SolutionArticle | null> {
  const resp = await lcCN.graphql({
    query: OFFICIAL_SOLUTION_QUERY,
    variables: { titleSlug },
  }) as { data?: { question?: { solution?: { title?: string; content?: string } | null } } };
  const sol = resp?.data?.question?.solution;
  if (!sol || !sol.content) return null;
  return { title: sol.title ?? '', content: sol.content ?? '' };
}

/** Fetch a community 题解 article by its slug (extracted from the pasted URL). */
export async function fetchCNCommunitySolution(
  lcCN: InstanceType<typeof LeetCodeCN>,
  articleSlug: string,
): Promise<SolutionArticle | null> {
  const resp = await lcCN.graphql({
    query: COMMUNITY_SOLUTION_QUERY,
    variables: { slug: articleSlug },
  }) as { data?: { solutionArticle?: { title?: string; content?: string } | null } };
  const art = resp?.data?.solutionArticle;
  if (!art || !art.content) return null;
  return { title: art.title ?? '', content: art.content ?? '' };
}

/** Parse a leetcode.cn community 题解 URL to extract the article slug.
 *  cn社区题解URL格式: https://leetcode.cn/problems/{problemSlug}/solutions/{articleSlug}/
 *  或: https://leetcode.cn/problems/{problemSlug}/solution/{articleSlug}/
 *  或带 query params 的变体.
 *  返回 null 表示无法解析。 */
export function parseCNSolutionUrl(url: string): { problemSlug: string; type: 'official' | 'community'; articleSlug?: string } | null {
  // Official editorial: /problems/{slug}/solution/
  const officialMatch = url.match(/leetcode\.cn\/problems\/([^/]+)\/solution\/?$/);
  if (officialMatch && officialMatch[1]) {
    return { problemSlug: officialMatch[1], type: 'official' };
  }

  // Community solution: /problems/{slug}/solutions/.../...
  const communityMatch = url.match(/leetcode\.cn\/problems\/([^/]+)\/solutions\/[^/]+\/([^/?#]+)/);
  if (communityMatch && communityMatch[1]) {
    return { problemSlug: communityMatch[1], type: 'community', articleSlug: communityMatch[2] };
  }

  return null;
}
