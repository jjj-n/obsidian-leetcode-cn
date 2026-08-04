// src/api/LeetCodeCNSubmissionAdapter.ts
// Ticket #6 — cn submission adapter. Fetches user's AC submissions from
// leetcode.cn and attempts to extract the source code.
// Falls back to resolveStarterCode when no AC submission or code is available.
import type { LeetCodeCN } from '@leetnotion/leetcode-api';

const SUBMISSION_LIST_QUERY = `
  query submissionList($offset: Int!, $limit: Int!, $questionSlug: String!) {
    submissionList(offset: $offset, limit: $limit, questionSlug: $questionSlug) {
      submissions {
        id
        statusDisplay
        lang
        timestamp
      }
    }
  }
`;

interface CNSubmission {
  id: string;
  statusDisplay: string;
  lang: string;
  timestamp: string;
}

/** Fetch recent submissions for a problem from leetcode.cn.
 *  Returns submissions sorted by recency (most recent first).
 *  Requires authentication — returns empty array on anonymous access. */
export async function fetchCNSubmissionList(
  lcCN: InstanceType<typeof LeetCodeCN>,
  questionSlug: string,
): Promise<CNSubmission[]> {
  try {
    const resp = await lcCN.graphql({
      query: SUBMISSION_LIST_QUERY,
      variables: { offset: 0, limit: 10, questionSlug },
    }) as { data?: { submissionList?: { submissions?: CNSubmission[] | null } | null } };
    return resp?.data?.submissionList?.submissions ?? [];
  } catch {
    return [];
  }
}

/** Find the most recent Accepted (AC) submission from a submission list. */
export function findAcceptedSubmission(
  submissions: CNSubmission[],
): CNSubmission | null {
  return submissions.find((s) => s.statusDisplay === 'Accepted') ?? null;
}

/** Extract submission ID from a leetcode.cn submission detail URL.
 *  URL format: https://leetcode.cn/submissions/detail/{id}/ */
export function extractSubmissionId(url: string): string | null {
  const m = url.match(/leetcode\.cn\/submissions\/detail\/(\d+)/);
  return m?.[1] ?? null;
}

/** Build the LEETCODE_SESSION cookie header from the stored cookies.
 *  Used for REST requests that need auth but don't go through graphql(). */
export function buildCookieHeader(leetCodeSession: string, csrftoken: string): string {
  return `LEETCODE_SESSION=${leetCodeSession}; csrftoken=${csrftoken}`;
}

/** Attempt to extract code from a submission detail REST page.
 *  The leetcode.cn submission detail page embeds the source code in a
 *  `var pageData = ...` script (similar to .com).
 *
 *  Returns null if extraction fails — caller should fall back to starter code. */
export function extractCodeFromSubmissionPage(html: string): string | null {
  // Try the `var pageData = {...}` pattern (LC embeds submission data here)
  const pdMatch = html.match(/var pageData\s*=\s*(\{[\s\S]*?\});/);
  if (pdMatch && pdMatch[1]) {
    try {
      const parsed = JSON.parse(pdMatch[1]) as { code?: string; submissionData?: { code?: string } };
      // The code might be at different paths depending on LC version
      const code = parsed.submissionData?.code ?? parsed.code;
      if (code && typeof code === 'string' && code.length > 0) return code;
    } catch {
      // JSON parse failures — fall through to other extraction strategies
    }
  }

  // Try extracting code from `<div class="CodeMirror-code"...` or `<textarea class="code-editor"...`
  const cmMatch = html.match(/<div class="CodeMirror-code">([\s\S]*?)<\/div>/);
  if (cmMatch && cmMatch[1]) {
    const cmHtml = cmMatch[1];
    const lineMatches = [...cmHtml.matchAll(/<pre[^>]*>(.*?)<\/pre>/g)];
    const lines: string[] = [];
    for (const m of lineMatches) {
      if (m[1]) {
        lines.push(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
      }
    }
    if (lines.length > 0) return lines.join('\n');
  }

  return null;
}
