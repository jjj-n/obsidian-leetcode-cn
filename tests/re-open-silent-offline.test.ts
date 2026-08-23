import { describe, it, expect, vi } from 'vitest';
import { makeMockVaultApp } from './helpers/mock-vault';
import { makeMockLeetCodeClient } from './helpers/mock-leetcode-client';
import { NoteWriter } from '../src/notes/NoteWriter';

// Capture Notice constructions via a module mock.
const noticeSpy = vi.fn();
vi.mock('obsidian', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('obsidian');
  return {
    ...actual,
    Notice: class MockNotice {
      constructor(msg: string, ms?: number) { noticeSpy(msg, ms); }
    },
  };
});

function makeStaleCacheSettings() {
  const details = new Map<string, unknown>([
    ['two-sum', {
      fetchedAt: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days ago — stale
      id: 1, title: 'Two Sum', difficulty: 'Easy',
      url: 'https://leetcode.com/problems/two-sum/',
      contentHtml: '<p>old</p>', topicSlugs: [],
    }],
  ]);
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

describe('NoteWriter re-open offline (D-12 silent policy)', () => {
  it('reveals the cached note and swallows the background-refresh network failure silently', async () => {
    noticeSpy.mockClear();
    const m = makeMockVaultApp({ 'LeetCode/1. Two Sum.md': '## Problem\nold.\n\n## Notes\n' });
    const client = makeMockLeetCodeClient({ throwOn: 'network' });
    const writer = new NoteWriter(m.app as never, client as never, makeStaleCacheSettings() as never);
    await writer.openProblem('two-sum');
    // Reveal happens. Quick-260605-wux: with no MarkdownView active (the
    // mock default), `revealNoteFile` routes through `getLeaf('tab').openFile`
    // — the pane-aware branch — instead of `openLinkText`.
    expect(m.spies.openFile).toHaveBeenCalled();
    // Give background-refresh promise a tick to settle.
    await new Promise((r) => window.setTimeout(r, 10));
    // D-12: NO Notice on offline background-refresh failure.
    const offlineNotices = noticeSpy.mock.calls.filter(([msg]) => /couldn.t fetch|offline|network/i.test(String(msg)));
    expect(offlineNotices).toHaveLength(0);
  });
});
