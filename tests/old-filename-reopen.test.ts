// tests/old-filename-reopen.test.ts
// Migration guard: notes created with the pre-v2 `{id}-{slug}.md` filename
// must still be found (lc-slug frontmatter fallback scan) — never duplicated
// by a second vault.create under the new `{id}. {题名}.md` name.
import { describe, it, expect } from 'vitest';
import { makeMockVaultApp } from './helpers/mock-vault';
import { makeMockLeetCodeClient, makeMockDetail } from './helpers/mock-leetcode-client';
import { NoteWriter } from '../src/notes/NoteWriter';

function makeMockSettings(withCache: boolean) {
  const details = new Map<string, unknown>();
  if (withCache) {
    details.set('two-sum', {
      fetchedAt: Date.now(), id: 1, title: 'Two Sum', titleCn: '两数之和',
      difficulty: 'Easy',
      url: 'https://leetcode.cn/problems/two-sum/',
      contentHtml: '<p>cached</p>', topicSlugs: [],
    });
  }
  return {
    getProblemsFolder: () => 'LeetCode',
    getDefaultLanguage: () => 'java',
    getRegion: () => 'cn' as const,
    getNoteTemplate: () => '',
    getNoteFooter: () => '',
    getDownloadImages: () => false,
    getImageFolder: () => '附件/leetcode',
    getCustomPlaceholders: () => ({}),
    getProblemDetail: (slug: string) => details.get(slug) ?? null,
    setProblemDetail: async (slug: string, d: unknown) => { details.set(slug, d); },
    pruneProblemDetails: async () => 0,
  };
}

describe('pre-v2 filename re-open (lc-slug fallback scan)', () => {
  it('re-opens an old 1-two-sum.md note via lc-slug frontmatter — no fetch, no duplicate create', async () => {
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': 'old body' });
    m.seedFrontmatter('LeetCode/1-two-sum.md', { 'lc-slug': 'two-sum' });
    const client = makeMockLeetCodeClient({ detail: makeMockDetail(1, 'two-sum') });
    const writer = new NoteWriter(m.app as never, client as never, makeMockSettings(true) as never);

    await writer.openProblem('two-sum');

    // Re-open path taken: no network fetch, no new note file (the only
    // vault.create may be the opportunistic LeetCode.base ship).
    expect(client.getProblemDetail).not.toHaveBeenCalled();
    const noteCreates = m.spies.create.mock.calls
      .map(([p]) => String(p))
      .filter((p) => p.endsWith('.md'));
    expect(noteCreates).toHaveLength(0);
    // The OLD note is the one revealed.
    const opened = m.spies.openLinkText.mock.calls[0]?.[0]
      ?? (m.spies.openFile.mock.calls[0]?.[0] as unknown as { path?: string })?.path;
    expect(opened).toBe('LeetCode/1-two-sum.md');
  });

  it('retrofits an old-name note even when the detail cache was cleared', async () => {
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': 'old body' });
    m.seedFrontmatter('LeetCode/1-two-sum.md', { 'lc-slug': 'two-sum' });
    const client = makeMockLeetCodeClient({ detail: makeMockDetail(1, 'two-sum') });
    const writer = new NoteWriter(m.app as never, client as never, makeMockSettings(false) as never);

    await writer.openProblem('two-sum');

    // Cache miss → fetch happens, but the canonical-pre-check must find the
    // old-name note via the slug scan instead of creating a duplicate note
    // (the opportunistic LeetCode.base create is allowed).
    expect(client.getProblemDetail).toHaveBeenCalledWith('two-sum');
    const noteCreates = m.spies.create.mock.calls
      .map(([p]) => String(p))
      .filter((p) => p.endsWith('.md'));
    expect(noteCreates).toHaveLength(0);
  });
});
