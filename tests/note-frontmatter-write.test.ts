import { describe, it, expect } from 'vitest';
import { makeMockVaultApp } from './helpers/mock-vault';
import { applyFrontmatter } from '../src/notes/NoteTemplate';

describe('applyFrontmatter (NOTE-03 lc-* keys)', () => {
  it('writes the 4 owned lc-* keys, no aliases, and unions pluginTags on empty frontmatter', async () => {
    // new-note path: file created via vault.create then applyFrontmatter (matches Plan 02-03 T2 race-guard path).
    const m = makeMockVaultApp();
    const file = await m.app.vault.create('LeetCode/1. Two Sum.md', '');
    await applyFrontmatter(m.app as never, file as never, {
      id: 1,
      slug: 'two-sum',
      title: 'Two Sum',
      difficulty: 'Easy',
      url: 'https://leetcode.com/problems/two-sum/',
      language: 'python3',
      pluginTags: ['lc/easy'],
    });
    const fm = m.getFrontmatter('LeetCode/1. Two Sum.md');
    expect(fm).toBeDefined();
    expect(fm!['lc-slug']).toBe('two-sum');
    expect(fm!['lc-status']).toBe('untouched');
    expect(fm!['lc-language']).toBe('python3');
    // Template v2: identity keys retired — nothing else may be written.
    expect(fm!['lc-id']).toBeUndefined();
    expect(fm!['lc-title']).toBeUndefined();
    expect(fm!['lc-difficulty']).toBeUndefined();
    expect(fm!['lc-url']).toBeUndefined();
    expect(fm!.aliases).toBeUndefined();
    expect(fm!.tags).toEqual(expect.arrayContaining(['lc/easy']));
  });

  it('deletes retired lc-* identity keys from pre-template-v2 notes (migration)', async () => {
    const m = makeMockVaultApp({ 'LeetCode/1. Two Sum.md': '' });
    m.seedFrontmatter('LeetCode/1. Two Sum.md', {
      'lc-id': 1,
      'lc-slug': 'two-sum',
      'lc-title': 'Two Sum',
      'lc-difficulty': 'Easy',
      'lc-url': 'https://leetcode.cn/problems/two-sum/',
      'lc-region': 'cn',
      'lc-status': 'untouched',
      'lc-language': 'python3',
      分类: '数组、哈希表',
    });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1. Two Sum.md')!;
    await applyFrontmatter(m.app as never, file as never, {
      id: 1, slug: 'two-sum', title: 'Two Sum', difficulty: 'Easy',
      url: 'https://leetcode.cn/problems/two-sum/', language: 'python3', pluginTags: [],
    });
    const fm = m.getFrontmatter('LeetCode/1. Two Sum.md')!;
    for (const retired of ['lc-id', 'lc-title', 'lc-difficulty', 'lc-url', 'lc-region']) {
      expect(fm[retired]).toBeUndefined();
    }
    // Owned keys + user properties survive.
    expect(fm['lc-slug']).toBe('two-sum');
    expect(fm['分类']).toBe('数组、哈希表');
  });

  it('does not downgrade lc-status from "accepted" back to "untouched" on regeneration (D-04)', async () => {
    const m = makeMockVaultApp({ 'LeetCode/1. Two Sum.md': '' });
    m.seedFrontmatter('LeetCode/1. Two Sum.md', { 'lc-status': 'accepted' });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1. Two Sum.md')!;
    await applyFrontmatter(m.app as never, file as never, {
      id: 1, slug: 'two-sum', title: 'Two Sum', difficulty: 'Easy',
      url: 'https://leetcode.com/problems/two-sum/', language: 'python3', pluginTags: [],
    });
    const fm = m.getFrontmatter('LeetCode/1. Two Sum.md');
    expect(fm!['lc-status']).toBe('accepted');
  });
});

describe('applyFrontmatter — lc-status initial mapping (GAP-2a, D-04)', () => {
  const baseInput = {
    id: 1,
    slug: 'two-sum',
    title: 'Two Sum',
    difficulty: 'Easy' as const,
    url: 'https://leetcode.com/problems/two-sum/',
    language: 'python3',
    pluginTags: ['lc/easy'],
  };

  it("writes lc-status: accepted on empty frontmatter when initialStatus='accepted'", async () => {
    const m = makeMockVaultApp();
    const file = await m.app.vault.create('LeetCode/1. Two Sum.md', '');
    await applyFrontmatter(m.app as never, file as never, {
      ...baseInput,
      initialStatus: 'accepted',
    });
    const fm = m.getFrontmatter('LeetCode/1. Two Sum.md');
    expect(fm!['lc-status']).toBe('accepted');
  });

  it("writes lc-status: attempted on empty frontmatter when initialStatus='attempted'", async () => {
    const m = makeMockVaultApp();
    const file = await m.app.vault.create('LeetCode/1. Two Sum.md', '');
    await applyFrontmatter(m.app as never, file as never, {
      ...baseInput,
      initialStatus: 'attempted',
    });
    const fm = m.getFrontmatter('LeetCode/1. Two Sum.md');
    expect(fm!['lc-status']).toBe('attempted');
  });

  it('writes lc-status: untouched on empty frontmatter when initialStatus is undefined (back-compat)', async () => {
    const m = makeMockVaultApp();
    const file = await m.app.vault.create('LeetCode/1. Two Sum.md', '');
    await applyFrontmatter(m.app as never, file as never, baseInput);
    const fm = m.getFrontmatter('LeetCode/1. Two Sum.md');
    expect(fm!['lc-status']).toBe('untouched');
  });

  it("D-04 preservation: initialStatus='untouched' MUST NOT downgrade existing 'accepted'", async () => {
    const m = makeMockVaultApp({ 'LeetCode/1. Two Sum.md': '' });
    m.seedFrontmatter('LeetCode/1. Two Sum.md', { 'lc-status': 'accepted' });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1. Two Sum.md')!;
    await applyFrontmatter(m.app as never, file as never, {
      ...baseInput,
      initialStatus: 'untouched',
    });
    const fm = m.getFrontmatter('LeetCode/1. Two Sum.md');
    expect(fm!['lc-status']).toBe('accepted');
  });

  it("D-04 idempotence: initialStatus='accepted' on existing 'accepted' leaves it as 'accepted'", async () => {
    const m = makeMockVaultApp({ 'LeetCode/1. Two Sum.md': '' });
    m.seedFrontmatter('LeetCode/1. Two Sum.md', { 'lc-status': 'accepted' });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1. Two Sum.md')!;
    await applyFrontmatter(m.app as never, file as never, {
      ...baseInput,
      initialStatus: 'accepted',
    });
    const fm = m.getFrontmatter('LeetCode/1. Two Sum.md');
    expect(fm!['lc-status']).toBe('accepted');
  });
});
