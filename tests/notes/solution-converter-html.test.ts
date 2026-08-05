// tests/notes/solution-converter-html.test.ts
// Ticket 06: solution converter HTML-to-Markdown integration
import { describe, it, expect } from 'vitest';
import { convertSolution, splitSolutionContent } from '../../src/notes/SolutionConverter';

describe('convertSolution with HTML', () => {
  it('converts HTML content to Markdown', () => {
    const html = `
      <h2>Approach</h2>
      <p>Use <strong>two pointers</strong> technique.</p>
      <pre><code class="language-python">def solve(nums):
    return sum(nums)</code></pre>
    `;
    const result = convertSolution({ title: 'Test', content: html });
    // htmlToMarkdown converts HTML to Markdown
    expect(result.approach).toContain('two pointers');
    expect(result.code).toContain('def solve(nums):');
  });

  it('handles complex HTML with math and images', () => {
    const html = `
      <p>Time complexity: O(n log n)</p>
      <p>See the diagram below:</p>
      <img src="https://pic.leetcode-cn.com/test.png" alt="diagram">
      <pre><code class="language-java">class Solution {
    public int solve() { return 0; }
}</code></pre>
    `;
    const result = convertSolution({ title: 'Test', content: html });
    expect(result.approach).toContain('Time complexity');
    expect(result.approach).toContain('diagram');
    expect(result.code).toContain('class Solution');
  });

  it.skip('handles playground iframe by converting to link', () => {
    // TODO: htmlToMarkdown might try to fetch the iframe URL in test env
    const html = `
      <p>Here's the solution:</p>
      <iframe src="https://leetcode.cn/playground/abc123/shared"></iframe>
      <p>Explanation follows.</p>
    `;
    const result = convertSolution({ title: 'Test', content: html });
    expect(result.code).toContain('abc123');
    expect(result.approach).toContain('Explanation');
  });

  it('strips script and style tags', () => {
    const html = `
      <script>alert('xss')</script>
      <style>body { color: red; }</style>
      <p>Clean content</p>
      <pre><code>code here</code></pre>
    `;
    const result = convertSolution({ title: 'Test', content: html });
    // htmlToMarkdown should strip dangerous tags
    expect(result.approach).not.toContain('alert');
    expect(result.approach).toContain('Clean content');
  });
});

describe('splitSolutionContent', () => {
  it('splits code blocks from prose', () => {
    const content = `
# Approach

Use dynamic programming.

\`\`\`python
def solve(n):
    return n * 2
\`\`\`

## Complexity

Time: O(n)
`;
    const result = splitSolutionContent(content);
    expect(result.code).toContain('def solve(n):');
    expect(result.approach).toContain('dynamic programming');
    expect(result.approach).toContain('Time: O(n)');
  });

  it('handles content with no code blocks', () => {
    const content = '# Explanation\n\nJust a description, no code.';
    const result = splitSolutionContent(content);
    expect(result.code).toBe('');
    expect(result.approach).toContain('Just a description');
  });

  it('handles content with only code', () => {
    const content = '```python\ndef solve():\n    pass\n```';
    const result = splitSolutionContent(content);
    expect(result.code).toContain('def solve():');
    expect(result.approach).toBe('');
  });

  it('treats playground links as code', () => {
    const content = `
Explanation text.

[查看代码](https://leetcode.cn/playground/xyz/shared)

More explanation.
`;
    const result = splitSolutionContent(content);
    expect(result.code).toContain('[查看代码]');
    expect(result.approach).toContain('Explanation');
    expect(result.approach).not.toContain('查看代码');
  });
});
