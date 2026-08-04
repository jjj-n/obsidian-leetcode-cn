import { describe, it, expect } from 'vitest';
import { makeMockVaultApp } from './helpers/mock-vault';
import { makeMockLeetCodeClient, makeMockDetail } from './helpers/mock-leetcode-client';
import { NoteWriter } from '../src/notes/NoteWriter';

function makeMockSettings(folder: string) {
  const details = new Map<string, unknown>();
  return {
    getProblemsFolder: () => folder,
    setProblemsFolder: async () => undefined,
    getDefaultLanguage: () => 'python3',
    setDefaultLanguage: async () => undefined,
    getRegion: () => 'cn' as const,
    getNoteTemplate: () => '',
    getProblemDetail: (slug: string) => details.get(slug) ?? null,
    setProblemDetail: async (slug: string, d: unknown) => { details.set(slug, d); },
    pruneProblemDetails: async () => 0,
  };
}

describe('NoteWriter path construction (NOTE-08)', () => {
  it('uses settings.getProblemsFolder() for the note path', async () => {
    const m = makeMockVaultApp({});
    const client = makeMockLeetCodeClient({ detail: makeMockDetail(1, 'two-sum') });
    const writer = new NoteWriter(m.app as never, client as never, makeMockSettings('CustomFolder/LC') as never);
    await writer.openProblem('two-sum');
    expect(m.spies.create).toHaveBeenCalledWith(
      'CustomFolder/LC/1-two-sum.md',
      expect.any(String),
    );
  });
});
