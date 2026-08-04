import { describe, it, expect } from 'vitest';
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
    getNoteTemplate: () => '',
    getDownloadImages: () => false,
    getImageFolder: () => '附件/leetcode',
    getCustomPlaceholders: () => ({}),
    getProblemDetail: (slug: string) => details.get(slug) ?? null,
    setProblemDetail: async (slug: string, d: unknown) => { details.set(slug, d); },
    pruneProblemDetails: async () => 0,
  };
}

describe('NoteWriter.openProblem folder autocreate (NOTE-01)', () => {
  it('creates the problems folder if it does not exist, then writes the note', async () => {
    const m = makeMockVaultApp({});
    const client = makeMockLeetCodeClient({ detail: makeMockDetail(1, 'two-sum') });
    const settings = makeMockSettings();
    const writer = new NoteWriter(m.app as never, client as never, settings as never);
    await writer.openProblem('two-sum');
    expect(m.spies.createFolder).toHaveBeenCalledWith('LeetCode');
    expect(m.spies.create).toHaveBeenCalledWith(
      expect.stringMatching(/^LeetCode\/1-two-sum\.md$/),
      expect.any(String),
    );
  });
});
