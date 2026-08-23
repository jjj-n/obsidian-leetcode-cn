import { describe, it, expect } from 'vitest';
import { makeMockVaultApp } from './helpers/mock-vault';
import { makeMockLeetCodeClient, makeMockDetail } from './helpers/mock-leetcode-client';
import { NoteWriter, CACHE_TTL_MS } from '../src/notes/NoteWriter';

function makeMockSettings(fetchedAt: number, body = '## Problem\nstatement.\n\n## Notes\n') {
  const details = new Map<string, unknown>([
    ['two-sum', {
      fetchedAt, id: 1, title: 'Two Sum', difficulty: 'Easy',
      url: 'https://leetcode.com/problems/two-sum/',
      contentHtml: '<p>cached</p>', topicSlugs: [],
    }],
  ]);
  return {
    body,
    getProblemsFolder: () => 'LeetCode',
    setProblemsFolder: async () => undefined,
    getDefaultLanguage: () => 'python3',
    setDefaultLanguage: async () => undefined,
    getProblemDetail: (slug: string) => details.get(slug) ?? null,
    setProblemDetail: async (slug: string, d: unknown) => { details.set(slug, d); },
    pruneProblemDetails: async () => 0,
  };
}

describe('NoteWriter cache TTL (D-11, D-14)', () => {
  it('returns cached detail without network call when cache is fresh (< 7 days)', async () => {
    const m = makeMockVaultApp({ 'LeetCode/1. Two Sum.md': '## Problem\ncached.\n\n## Notes\n' });
    const client = makeMockLeetCodeClient({ detail: makeMockDetail(1, 'two-sum') });
    const settings = makeMockSettings(Date.now() - 1000);
    const writer = new NoteWriter(m.app as never, client as never, settings as never);
    await writer.openProblem('two-sum');
    expect(client.getProblemDetail).not.toHaveBeenCalled();
  });

  it('triggers background fetch when cache is stale (>= 7 days)', async () => {
    const m = makeMockVaultApp({ 'LeetCode/1. Two Sum.md': '## Problem\nstale.\n\n## Notes\n' });
    const client = makeMockLeetCodeClient({ detail: makeMockDetail(1, 'two-sum') });
    const settings = makeMockSettings(Date.now() - CACHE_TTL_MS - 1000);
    const writer = new NoteWriter(m.app as never, client as never, settings as never);
    await writer.openProblem('two-sum');
    // Give the background-refresh a tick to run.
    await new Promise((r) => window.setTimeout(r, 10));
    expect(client.getProblemDetail).toHaveBeenCalledWith('two-sum');
  });

  it('exports CACHE_TTL_MS = 7 days (D-14)', () => {
    expect(CACHE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
