import { describe, it, expect } from 'vitest';
import { makeMockVaultApp } from './helpers/mock-vault';
import { applyFrontmatter } from '../src/notes/NoteTemplate';

// Template v2: the default note shape carries no aliases, so applyFrontmatter
// stopped WRITING them. Whatever aliases the user keeps (hand-added, or plugin
// entries from pre-v2 notes) must survive untouched.
describe('applyFrontmatter alias preservation (template v2)', () => {
  it('preserves user-added aliases verbatim without adding plugin entries', async () => {
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': '' });
    m.seedFrontmatter('LeetCode/1-two-sum.md', {
      aliases: ['My Favorite Problem', '首刷'],
    });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;
    await applyFrontmatter(m.app as never, file as never, {
      id: 1, slug: 'two-sum', title: 'Two Sum', difficulty: 'Easy',
      url: '', language: 'python3', pluginTags: [],
    });
    const fm = m.getFrontmatter('LeetCode/1-two-sum.md')!;
    expect(fm.aliases).toEqual(['My Favorite Problem', '首刷']);
  });

  it('does not create aliases on notes that never had them', async () => {
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': '' });
    const file = m.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md')!;
    await applyFrontmatter(m.app as never, file as never, {
      id: 1, slug: 'two-sum', title: 'Two Sum', difficulty: 'Easy',
      url: '', language: 'python3', pluginTags: [],
    });
    const fm = m.getFrontmatter('LeetCode/1-two-sum.md')!;
    expect(fm.aliases).toBeUndefined();
    // Legacy pre-v2 plugin aliases on disk are NOT deleted (deletion could
    // eat hand-added entries; they just stop being refreshed).
    expect(fm['lc-slug']).toBe('two-sum');
  });
});
