import { describe, it, expect } from 'vitest';
import { makeMockVaultApp } from './helpers/mock-vault';
import { applyFrontmatter, buildFrontmatterInput } from '../src/notes/NoteTemplate';

// Template v2 tag policy: the open/refresh path contributes NO plugin tags —
// the note's tags come from the template render (leetcode + language), and
// metadata lives in 分类/难度. The union-merge mechanism itself stays alive
// for callers that pass explicit pluginTags (solve-time writers).
describe('tag policy (template v2 — no plugin tags by default)', () => {
  it('buildFrontmatterInput contributes an empty pluginTags set', async () => {
    const input = buildFrontmatterInput({
      fetchedAt: 0, id: 42, title: 'Trapping Rain Water', difficulty: 'Hard',
      url: 'https://leetcode.com/problems/trapping-rain-water/',
      contentHtml: '<p>...</p>', topicSlugs: ['array', 'two-pointers'],
    } as never, 'python3');
    expect(input.pluginTags).toEqual([]);
  });

  // GAP-2a scope guard: status must NOT bleed into the tag set either.
  it.each([undefined, 'accepted', 'attempted', 'untouched'] as const)(
    'buildFrontmatterInput keeps pluginTags empty when initialStatus=%s (GAP-2a scope guard)',
    (status) => {
      const input = buildFrontmatterInput({
        fetchedAt: 0, id: 1, title: 'Two Sum', difficulty: 'Easy',
        url: 'https://leetcode.com/problems/two-sum/',
        contentHtml: '<p>...</p>', topicSlugs: ['array', 'hash-table'],
      } as never, 'python3', status);
      expect(input.pluginTags).toEqual([]);
    },
  );

  it('preserves template-rendered tags when pluginTags is empty', async () => {
    const m = makeMockVaultApp({ 'LeetCode/1. Two Sum.md': '' });
    m.seedFrontmatter('LeetCode/1. Two Sum.md', { tags: ['leetcode', 'java'] });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1. Two Sum.md')!;
    await applyFrontmatter(m.app as never, file as never, {
      id: 1, slug: 'two-sum', title: 'Two Sum', difficulty: 'Easy',
      url: 'https://leetcode.cn/problems/two-sum/', language: 'java',
      pluginTags: [],
    });
    const fm = m.getFrontmatter('LeetCode/1. Two Sum.md')!;
    expect(fm.tags).toEqual(['leetcode', 'java']);
  });

  it('still union-merges explicit pluginTags when a caller passes them', async () => {
    const m = makeMockVaultApp({ 'LeetCode/1. Two Sum.md': '' });
    m.seedFrontmatter('LeetCode/1. Two Sum.md', { tags: ['leetcode', 'revisit'] });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1. Two Sum.md')!;
    await applyFrontmatter(m.app as never, file as never, {
      id: 1, slug: 'two-sum', title: 'Two Sum', difficulty: 'Easy',
      url: '', language: 'python3', pluginTags: ['lc/easy'],
    });
    const fm = m.getFrontmatter('LeetCode/1. Two Sum.md');
    expect(fm!.tags).toEqual(expect.arrayContaining(['lc/easy', 'leetcode', 'revisit']));
  });
});
