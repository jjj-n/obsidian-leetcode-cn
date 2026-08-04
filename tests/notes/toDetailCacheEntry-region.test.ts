// tests/notes/toDetailCacheEntry-region.test.ts
// Ticket #1: toDetailCacheEntry must use region-aware URL builder.
import { describe, it, expect } from 'vitest';
import { toDetailCacheEntry } from '../../src/notes/NoteWriter';
import type { NoteWriterDetail } from '../../src/notes/NoteWriter';

function makeDetail(overrides: Partial<NoteWriterDetail> = {}): NoteWriterDetail {
  return {
    questionFrontendId: '1',
    titleSlug: 'two-sum',
    title: 'Two Sum',
    content: '<p>content</p>',
    difficulty: 'Easy',
    isPaidOnly: false,
    topicTags: [],
    ...overrides,
  };
}

describe('toDetailCacheEntry — region-aware URL', () => {
  it('generates cn URL when region is cn', () => {
    const entry = toDetailCacheEntry(makeDetail(), 'cn');
    expect(entry.url).toBe('https://leetcode.cn/problems/two-sum/');
  });

  it('generates com URL when region is com', () => {
    const entry = toDetailCacheEntry(makeDetail(), 'com');
    expect(entry.url).toBe('https://leetcode.com/problems/two-sum/');
  });

  it('defaults to cn when region is not provided', () => {
    const entry = toDetailCacheEntry(makeDetail());
    expect(entry.url).toBe('https://leetcode.cn/problems/two-sum/');
  });
});
