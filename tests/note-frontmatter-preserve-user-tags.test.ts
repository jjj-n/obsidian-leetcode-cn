import { describe, it, expect } from 'vitest';
import { makeMockVaultApp } from './helpers/mock-vault';
import { applyFrontmatter } from '../src/notes/NoteTemplate';

describe('applyFrontmatter user-tag preservation (NOTE-05, D-10)', () => {
  it('preserves user-added tags like #revisit across regeneration', async () => {
    const m = makeMockVaultApp({ 'LeetCode/1. Two Sum.md': '' });
    m.seedFrontmatter('LeetCode/1. Two Sum.md', {
      tags: ['lc/easy', 'revisit', 'tricky'],
    });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1. Two Sum.md')!;
    await applyFrontmatter(m.app as never, file as never, {
      id: 1, slug: 'two-sum', title: 'Two Sum', difficulty: 'Easy',
      url: '', language: 'python3', pluginTags: ['lc/easy'],
    });
    const fm = m.getFrontmatter('LeetCode/1. Two Sum.md')!;
    expect(fm.tags).toEqual(expect.arrayContaining(['lc/easy', 'revisit', 'tricky']));
    // No duplicates from the union merge.
    const tags = fm.tags as string[];
    expect(new Set(tags).size).toBe(tags.length);
  });

  it('preserves Phase-4-added topic tags on a Phase-2 regeneration', async () => {
    // When Phase 4 has already added lc/array + lc/hash-table, a later Phase 2
    // re-open (difficulty-only pluginTags) must NOT remove them.
    const m = makeMockVaultApp({ 'LeetCode/1. Two Sum.md': '' });
    m.seedFrontmatter('LeetCode/1. Two Sum.md', {
      tags: ['lc/easy', 'lc/array', 'lc/hash-table'],
    });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1. Two Sum.md')!;
    await applyFrontmatter(m.app as never, file as never, {
      id: 1, slug: 'two-sum', title: 'Two Sum', difficulty: 'Easy',
      url: '', language: 'python3', pluginTags: ['lc/easy'],
    });
    const fm = m.getFrontmatter('LeetCode/1. Two Sum.md')!;
    expect(fm.tags).toEqual(expect.arrayContaining(['lc/easy', 'lc/array', 'lc/hash-table']));
  });
});
