import { describe, it, expect } from 'vitest';
import { makeMockVaultApp } from './helpers/mock-vault';
import { makeMockLeetCodeClient } from './helpers/mock-leetcode-client';
import { NoteWriter } from '../src/notes/NoteWriter';

function makeMockSettings(prewarmedCache: { fetchedAt: number; id: number; title: string; difficulty: 'Easy' | 'Medium' | 'Hard'; url: string; contentHtml: string; topicSlugs: string[] }) {
  const details = new Map<string, unknown>([['two-sum', prewarmedCache]]);
  return {
    getProblemsFolder: () => 'LeetCode',
    setProblemsFolder: async () => undefined,
    getDefaultLanguage: () => 'python3',
    setDefaultLanguage: async () => undefined,
    getProblemDetail: (slug: string) => details.get(slug) ?? null,
    setProblemDetail: async (slug: string, d: unknown) => { details.set(slug, d); },
    pruneProblemDetails: async () => 0,
  };
}

describe('NoteWriter offline regeneration (NOTE-07)', () => {
  it('re-reveals a cached note without calling the network when cache is fresh', async () => {
    const m = makeMockVaultApp({ 'LeetCode/1. Two Sum.md': '## Problem\nStatement.\n\n## Notes\n' });
    const client = makeMockLeetCodeClient({ throwOn: 'network' });  // would throw if called
    const settings = makeMockSettings({
      fetchedAt: Date.now() - 1000,
      id: 1, title: 'Two Sum', difficulty: 'Easy',
      url: 'https://leetcode.com/problems/two-sum/',
      contentHtml: '<p>fresh</p>', topicSlugs: [],
    });
    const writer = new NoteWriter(m.app as never, client as never, settings as never);
    await expect(writer.openProblem('two-sum')).resolves.toBeUndefined();
    expect(client.getProblemDetail).not.toHaveBeenCalled();
    // Quick-260605-wux: with no MarkdownView active (mock default),
    // `revealNoteFile` routes through `getLeaf('tab').openFile`.
    expect(m.spies.openFile).toHaveBeenCalled();
  });
});
