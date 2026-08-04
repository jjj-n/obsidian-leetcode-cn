// tests/notes/htmlToMarkdown-cn.test.ts
// Ticket #7: htmlToMarkdown 加固 — verify cn-specific content works.
import { describe, it, expect } from 'vitest';
import { htmlToMarkdown } from '../../src/notes/htmlToMarkdown';

describe('htmlToMarkdown — cn content hardening', () => {
  it('preserves assets.leetcode.cn image URLs', () => {
    const html = '<p>示意图：</p><img src="https://assets.leetcode.cn/uploads/example.png" alt="example">';
    const result = htmlToMarkdown(html);
    expect(result).toContain('![example](https://assets.leetcode.cn/uploads/example.png)');
  });

  it('preserves leetcode.cn CDN image URLs', () => {
    const html = '<img src="https://assets.leetcode.cn/aliyun-lc-upload/uploads/diagram.jpg">';
    const result = htmlToMarkdown(html);
    expect(result).toContain('assets.leetcode.cn');
    expect(result).not.toContain('<img');
  });

  it('handles cn problem example block (Chinese labels 输入/输出)', () => {
    const html = `<p><strong class="example">示例 1：</strong></p>
<pre><strong>输入：</strong>x = 2.00000, n = 10
<strong>输出：</strong>1024.00000
</pre>`;
    const result = htmlToMarkdown(html);
    expect(result).toContain('示例');
    expect(result).toContain('输入');
    expect(result).toContain('输出');
  });

  it('handles cn superscript in problem content', () => {
    const html = '<p>x<sup>n</sup></p>';
    const result = htmlToMarkdown(html);
    expect(result).toContain('xⁿ');
  });

  it('handles cn subscript in problem content', () => {
    const html = '<p>a<sub>0</sub>, a<sub>1</sub></p>';
    const result = htmlToMarkdown(html);
    expect(result).toContain('a₀');
    expect(result).toContain('a₁');
  });

  it('handles empty img tag without crashing', () => {
    const result = htmlToMarkdown('<img src="">');
    expect(result).toBe('');
  });

  it('handles mixed cn + en content gracefully', () => {
    const html = '<p>给定一个整数数组 <code>nums</code> 和一个目标值 <code>target</code>。</p>';
    const result = htmlToMarkdown(html);
    expect(result).toContain('`nums`');
    expect(result).toContain('`target`');
    expect(result).toContain('数组');
  });

  it('preserves GFM tables from cn problems', () => {
    const html = `<table><thead><tr><th>Symbol</th><th>Value</th></tr></thead>
<tbody><tr><td>I</td><td>1</td></tr><tr><td>V</td><td>5</td></tr></tbody></table>`;
    const result = htmlToMarkdown(html);
    // Tables are converted by turndown-plugin-gfm
    expect(result).toContain('|');
    expect(result).toContain('Symbol');
  });
});
