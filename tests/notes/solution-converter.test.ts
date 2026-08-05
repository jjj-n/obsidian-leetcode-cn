// tests/notes/solution-converter.test.ts
// Ticket #4: 题解 converter tests.
import { describe, it, expect } from 'vitest';
import { convertSolution, splitSolutionContent } from '../../src/notes/SolutionConverter';

describe('splitSolutionContent', () => {
  it('separates fenced code blocks from prose', () => {
    const { code, approach } = splitSolutionContent(
      '## 方法一\n\n解释说明。\n\n```python\ndef solve():\n    pass\n```\n\n复杂度分析。',
    );
    expect(code).toContain('```python');
    expect(code).toContain('def solve():');
    expect(approach).toContain('## 方法一');
    expect(approach).toContain('复杂度分析');
  });

  it('handles content with no code blocks', () => {
    const { code, approach } = splitSolutionContent('只有文字，没有代码。');
    expect(code).toBe('');
    expect(approach).toBe('只有文字，没有代码。');
  });

  it('handles content with only code blocks', () => {
    const { code, approach } = splitSolutionContent('```java\nint x = 1;\n```');
    expect(code).toContain('```java');
    expect(approach).toBe('');
  });
});

describe('convertSolution', () => {
  it('strips [TOC] header', () => {
    const result = convertSolution({
      title: '官方题解',
      content: '[TOC]\n\n## 方法一\n\n正文。\n\n```cpp\nint x;\n```',
    });
    expect(result.title).toBe('官方题解');
    expect(result.approach).not.toContain('[TOC]');
    expect(result.approach).toContain('## 方法一');
    expect(result.code).toContain('```cpp');
  });

  it('preserves $$ math delimiters', () => {
    const result = convertSolution({
      title: 'Math test',
      content: '时间复杂度：$$O(n^2)$$。\n\n$$\nx^2 + y^2 = z^2\n$$',
    });
    // Display math (multi-line) stays as $$
    expect(result.approach).toContain('$$');
  });

  it('converts playground iframe to link', () => {
    const result = convertSolution({
      title: 'Playground test',
      content: '<iframe src="https://leetcode.cn/playground/abc123/shared" frameBorder="0" width="100%" height="225" name="abc123"></iframe>',
    });
    // htmlToMarkdown processes the iframe, and convertPlaygroundIframes converts it to a link
    // The link should appear in the code section (as it's a code reference)
    expect(result.code).toContain('leetcode.cn/playground/abc123');
  });

  it('strips HTML tags from community 题解', () => {
    const result = convertSolution({
      title: '社区题解',
      content: '<p>这是一段<b>重要</b>的思路。</p><br><p>第二段。</p>',
    });
    expect(result.approach).toContain('这是一段**重要**的思路');
    expect(result.approach).toContain('第二段');
  });

  it('handles empty content', () => {
    const result = convertSolution({ title: 'Empty', content: '' });
    expect(result.title).toBe('Empty');
    expect(result.code).toBe('');
    expect(result.approach).toBe('');
  });
});
