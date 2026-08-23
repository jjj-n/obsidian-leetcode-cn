import { describe, it, expect, vi } from 'vitest';
import { makeMockVaultApp } from './helpers/mock-vault';
import { makeMockLeetCodeClient, makeMockDetail } from './helpers/mock-leetcode-client';
import { NoteWriter } from '../src/notes/NoteWriter';

function makeMockSettings(initial: { problemsFolder?: string; defaultLanguage?: string } = {}) {
  let folder = initial.problemsFolder ?? 'LeetCode';
  let lang = initial.defaultLanguage ?? 'python3';
  const details = new Map<string, unknown>();
  return {
    getProblemsFolder: () => folder,
    setProblemsFolder: async (v: string) => { folder = v; },
    getDefaultLanguage: () => lang,
    setDefaultLanguage: async (v: string) => { lang = v; },
    getRegion: () => 'cn' as const,
    getNoteTemplate: () => "",
    getNoteFooter: () => "",
    getDownloadImages: () => false,
    getImageFolder: () => '附件/leetcode',
    getCustomPlaceholders: () => ({}),
    getProblemDetail: (slug: string) => details.get(slug) ?? null,
    setProblemDetail: async (slug: string, d: unknown) => { details.set(slug, d); },
    pruneProblemDetails: async () => 0,
  };
}

describe('NoteWriter.openProblem reveal-leaf targeting', () => {
  it("routes new-note reveal through getLeaf('tab').openFile when active leaf is not a MarkdownView", async () => {
    const m = makeMockVaultApp({});
    // Pre-seed frontmatter on the canonical path so waitForFrontmatterIndexed
    // exits on first poll tick (avoid the ~800ms ceiling in the unit test).
    m.seedFrontmatter('LeetCode/1. Two Sum.md', { 'lc-slug': 'two-sum' });
    // Active leaf is NOT a MarkdownView — branch B.
    m.spies.getActiveViewOfType.mockReturnValue(null);
    // Spy on getLeaf('tab').openFile — the helper's branch-B reveal target.
    const openFile = vi.fn(async () => undefined);
    const getLeaf = vi.fn(() => ({ openFile }));
    (m.app.workspace as Record<string, unknown>).getLeaf = getLeaf;

    const client = makeMockLeetCodeClient({ detail: makeMockDetail(1, 'two-sum') });
    const settings = makeMockSettings();
    const writer = new NoteWriter(m.app as never, client as never, settings as never);

    await writer.openProblem('two-sum');

    expect(getLeaf).toHaveBeenCalledWith('tab');
    expect(openFile).toHaveBeenCalledTimes(1);
    expect(openFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'LeetCode/1. Two Sum.md' }),
    );
    expect(m.spies.openLinkText).not.toHaveBeenCalled();
  });

  it('routes new-note reveal through openLinkText when a MarkdownView is active', async () => {
    const m = makeMockVaultApp({});
    m.seedFrontmatter('LeetCode/1. Two Sum.md', { 'lc-slug': 'two-sum' });
    // Active leaf IS a MarkdownView (any truthy object — the helper only
    // checks truthiness; the typed return of getActiveViewOfType is the
    // real type guard in production).
    m.spies.getActiveViewOfType.mockReturnValue({} as never);
    const openFile = vi.fn(async () => undefined);
    const getLeaf = vi.fn(() => ({ openFile }));
    (m.app.workspace as Record<string, unknown>).getLeaf = getLeaf;

    const client = makeMockLeetCodeClient({ detail: makeMockDetail(1, 'two-sum') });
    const settings = makeMockSettings();
    const writer = new NoteWriter(m.app as never, client as never, settings as never);

    await writer.openProblem('two-sum');

    expect(m.spies.openLinkText).toHaveBeenCalledWith('LeetCode/1. Two Sum.md', '', false);
    expect(getLeaf).not.toHaveBeenCalled();
    expect(openFile).not.toHaveBeenCalled();
  });
});
