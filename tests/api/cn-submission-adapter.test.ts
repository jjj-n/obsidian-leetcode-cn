// tests/api/cn-submission-adapter.test.ts
// Ticket #6: cn submission adapter tests.
import { describe, it, expect, vi } from 'vitest';
import {
  fetchCNSubmissionList,
  findAcceptedSubmission,
  extractSubmissionId,
  extractCodeFromSubmissionPage,
} from '../../src/api/LeetCodeCNSubmissionAdapter';

function makeMockLCClient(result: unknown) {
  return { graphql: vi.fn(async () => result) };
}

describe('fetchCNSubmissionList', () => {
  it('returns submissions when present', async () => {
    const lc = makeMockLCClient({
      data: {
        submissionList: {
          submissions: [
            { id: '123', statusDisplay: 'Accepted', lang: 'python3', timestamp: '1000' },
            { id: '456', statusDisplay: 'Wrong Answer', lang: 'java', timestamp: '2000' },
          ],
        },
      },
    });
    const result = await fetchCNSubmissionList(lc as never, 'two-sum');
    expect(result).toHaveLength(2);
    expect(result[0]?.statusDisplay).toBe('Accepted');
  });

  it('returns empty array when no submissions', async () => {
    const lc = makeMockLCClient({ data: { submissionList: { submissions: [] } } });
    const result = await fetchCNSubmissionList(lc as never, 'two-sum');
    expect(result).toHaveLength(0);
  });

  it('returns empty array on graphql error', async () => {
    const lc = {
      graphql: vi.fn(async () => { throw new Error('network error'); }),
    };
    const result = await fetchCNSubmissionList(lc as never, 'two-sum');
    expect(result).toHaveLength(0);
  });
});

describe('findAcceptedSubmission', () => {
  it('finds the first Accepted submission', () => {
    const result = findAcceptedSubmission([
      { id: '1', statusDisplay: 'Wrong Answer', lang: 'cpp', timestamp: '1' },
      { id: '2', statusDisplay: 'Accepted', lang: 'python3', timestamp: '2' },
      { id: '3', statusDisplay: 'Accepted', lang: 'java', timestamp: '3' },
    ]);
    expect(result?.id).toBe('2');
  });

  it('returns null when no Accepted submission', () => {
    const result = findAcceptedSubmission([
      { id: '1', statusDisplay: 'Wrong Answer', lang: 'cpp', timestamp: '1' },
    ]);
    expect(result).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(findAcceptedSubmission([])).toBeNull();
  });
});

describe('extractSubmissionId', () => {
  it('extracts submission ID from cn URL', () => {
    expect(extractSubmissionId('https://leetcode.cn/submissions/detail/123456/')).toBe('123456');
  });

  it('returns null for non-submission URL', () => {
    expect(extractSubmissionId('https://leetcode.cn/problems/two-sum/')).toBeNull();
  });
});

describe('extractCodeFromSubmissionPage', () => {
  it('extracts code from pageData JSON', () => {
    const html = '<script>var pageData = {"code":"class Solution {}"};\n</script>';
    const code = extractCodeFromSubmissionPage(html);
    expect(code).toBe('class Solution {}');
  });

  it('extracts from submissionData.code path', () => {
    const html = '<script>var pageData = {"submissionData":{"code":"int x = 1;"}};</script>';
    const code = extractCodeFromSubmissionPage(html);
    expect(code).toBe('int x = 1;');
  });

  it('extracts from CodeMirror lines', () => {
    const html = '<div class="CodeMirror-code"><pre>def solve():</pre><pre>    pass</pre></div>';
    const code = extractCodeFromSubmissionPage(html);
    expect(code).toBe('def solve():\n    pass');
  });

  it('returns null when no code found', () => {
    expect(extractCodeFromSubmissionPage('<html>no code</html>')).toBeNull();
  });
});
