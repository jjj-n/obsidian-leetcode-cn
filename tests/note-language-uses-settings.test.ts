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

describe('NoteWriter frontmatter language (NOTE-09)', () => {
  it('writes lc-language = settings.getDefaultLanguage()', async () => {
    const m = makeMockVaultApp({});
    const client = makeMockLeetCodeClient({ detail: makeMockDetail(1, 'two-sum') });
    const writer = new NoteWriter(m.app as never, client as never, makeMockSettings('java') as never);
    await writer.openProblem('two-sum');
    const fm = m.getFrontmatter('LeetCode/1. Two Sum.md');
    expect(fm).toBeDefined();
    expect(fm!['lc-language']).toBe('java');
  });

  it('starter code lands as a fenced block tagged with the language slug (regression)', async () => {
    // Field-test finding 2026-08: bare starter code renders as plain
    // paragraphs in Obsidian. pickStarterCode must fence — this locks the
    // full creation path (openProblem → {{code}} → lc:code anchor).
    const m = makeMockVaultApp({});
    const client = makeMockLeetCodeClient({
      detail: makeMockDetail(1, 'two-sum', {
        codeSnippets: [{ lang: 'Java', langSlug: 'java', code: 'class Solution {}' }],
      }),
    });
    const writer = new NoteWriter(m.app as never, client as never, makeMockSettings('java') as never);
    await writer.openProblem('two-sum');
    const body = m.state.contents.get('LeetCode/1. Two Sum.md');
    const codeRegion = body?.match(/<!-- lc:code[^>]*-->\n([\s\S]*?)\n<!-- \/lc:code -->/);
    expect(codeRegion).toBeDefined();
    expect(codeRegion![1]).toMatch(/^```java\n/);
    expect(codeRegion![1]).toContain('class Solution {}');
    expect(codeRegion![1]).toMatch(/\n```$/);
  });
});
