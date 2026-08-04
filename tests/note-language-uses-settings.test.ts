import { describe, it, expect } from 'vitest';
import { makeMockVaultApp } from './helpers/mock-vault';
import { makeMockLeetCodeClient, makeMockDetail } from './helpers/mock-leetcode-client';
import { NoteWriter } from '../src/notes/NoteWriter';

function makeMockSettings(lang: string) {
  const details = new Map<string, unknown>();
  return {
    getProblemsFolder: () => 'LeetCode',
    setProblemsFolder: async () => undefined,
    getDefaultLanguage: () => lang,
    setDefaultLanguage: async () => undefined,
    getRegion: () => 'cn' as const,
    getNoteTemplate: () => '',
    getProblemDetail: (slug: string) => details.get(slug) ?? null,
    setProblemDetail: async (slug: string, d: unknown) => { details.set(slug, d); },
    pruneProblemDetails: async () => 0,
  };
}

describe('NoteWriter frontmatter language (NOTE-09)', () => {
  it('writes lc-language = settings.getDefaultLanguage()', async () => {
    const m = makeMockVaultApp({});
    const client = makeMockLeetCodeClient({ detail: makeMockDetail(1, 'two-sum') });
    const writer = new NoteWriter(m.app as never, client as never, makeMockSettings('java') as never);
    await writer.openProblem('two-sum');
    const fm = m.getFrontmatter('LeetCode/1-two-sum.md');
    expect(fm).toBeDefined();
    expect(fm!['lc-language']).toBe('java');
  });
});
