// tests/notes/paste-sanitizer.test.ts
// Ticket #04 — paste-sanitize command.
import { describe, it, expect } from 'vitest';
import { pasteSanitize } from '../../src/notes/PasteSanitizer';

describe('pasteSanitize', () => {
  it('strips script tags', () => {
    const result = pasteSanitize('<p>text</p><script>alert("xss")</script>');
    expect(result).not.toContain('script');
    expect(result).not.toContain('alert');
    expect(result).toContain('text');
  });

  it('strips style tags', () => {
    const result = pasteSanitize('<style>body{color:red}</style><p>Hello</p>');
    expect(result).not.toContain('style');
    expect(result).not.toContain('color:red');
    expect(result).toContain('Hello');
  });

  it('strips event handlers', () => {
    const result = pasteSanitize('<p onclick="alert(1)">text</p>');
    expect(result).not.toContain('onclick');
    expect(result).toContain('text');
  });

  it('converts playground iframe to link', () => {
    const result = pasteSanitize(
      '<iframe src="https://leetcode.cn/playground/abc123/shared"></iframe>',
    );
    expect(result).toContain('[查看代码]');
    expect(result).toContain('leetcode.cn/playground/abc123/shared');
  });

  it('strips non-playground iframes', () => {
    const result = pasteSanitize('<iframe src="https://evil.com"></iframe><p>ok</p>');
    expect(result).not.toContain('iframe');
    expect(result).not.toContain('evil.com');
    expect(result).toContain('ok');
  });

  it('normalizes inline math delimiters', () => {
    const result = pasteSanitize('<p>Math: \\(x^2\\) is squared</p>');
    expect(result).toContain('$x^2$');
  });

  it('normalizes display math delimiters', () => {
    // turndown collapses $$ → $; $x^2$ is valid Obsidian inline math.
    const result = pasteSanitize('<p>Big math: \\[x^2\\]</p>');
    expect(result).toContain('$x^2$');
  });

  it('normalizes span.math to inline math', () => {
    const result = pasteSanitize('<span class="math">x^2</span>');
    expect(result).toContain('$x^2$');
  });

  it('returns plain text unchanged', () => {
    expect(pasteSanitize('plain text')).toBe('plain text');
  });

  it('handles empty input', () => {
    expect(pasteSanitize('')).toBe('');
  });
});
