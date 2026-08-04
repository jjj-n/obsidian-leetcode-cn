// tests/notes/image-downloader.test.ts
// Ticket #02 — image downloader helpers.
import { describe, it, expect } from 'vitest';
import { extractImageUrls, isLCImageUrl } from '../../src/notes/ImageDownloader';

describe('extractImageUrls', () => {
  it('extracts single img src', () => {
    const urls = extractImageUrls('<img src="https://pic.leetcode-cn.com/foo.png" alt="x">');
    expect(urls).toEqual(['https://pic.leetcode-cn.com/foo.png']);
  });

  it('extracts multiple img src', () => {
    const html = '<p><img src="a.png"></p><img src="b.jpg"><p>x</p><img src="c.svg">';
    const urls = extractImageUrls(html);
    expect(urls).toEqual(['a.png', 'b.jpg', 'c.svg']);
  });

  it('returns empty for no images', () => {
    expect(extractImageUrls('<p>text</p>')).toEqual([]);
  });

  it('handles single-quoted src', () => {
    const urls = extractImageUrls("<img src='https://x.com/y.png'>");
    expect(urls).toEqual(['https://x.com/y.png']);
  });
});

describe('isLCImageUrl', () => {
  it('matches leetcode-cn CDN', () => {
    expect(isLCImageUrl('https://pic.leetcode-cn.com/foo.png')).toBe(true);
    expect(isLCImageUrl('https://assets.leetcode-cn.com/uploads/bar.jpg')).toBe(true);
  });

  it('rejects .com CDN and non-LC URLs', () => {
    expect(isLCImageUrl('https://assets.leetcode.com/uploads/img.png')).toBe(false);
    expect(isLCImageUrl('https://example.com/img.png')).toBe(false);
  });
});
