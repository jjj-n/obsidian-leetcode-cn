// tests/note-status-plumbing.test.ts
// GAP-2a end-to-end: ProblemBrowserView → plugin.openProblem → NoteWriter.openProblem
// → buildFrontmatterInput → applyFrontmatter.
//
// Covers:
//   Tests 1-4: initialStatus hint lands as lc-status on the first-opened note
//   Test 5:    D-04 non-downgrade — background-refresh cannot flip an existing
//              'accepted' back to anything else (even when caller passes 'untouched').
import { describe, it, expect, vi } from 'vitest';
import { makeMockVaultApp } from './helpers/mock-vault';
import { makeMockLeetCodeClient, makeMockDetail } from './helpers/mock-leetcode-client';
import { NoteWriter } from '../src/notes/NoteWriter';

// Notice mock (shared pattern with new-note-fetch-failure.test.ts)
vi.mock('obsidian', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('obsidian');
  return {
    ...actual,
    Notice: class MockNotice {
      constructor(_msg: string, _ms?: number) { /* no-op */ }
    },
  };
});

function makeEmptySettings() {
  const details = new Map<string, unknown>();
  return {
    getProblemsFolder: () => 'LeetCode',
    setProblemsFolder: async () => undefined,
    getDefaultLanguage: () => 'python3',
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

function makeStaleCacheSettings(existingStatus: string) {
  const details = new Map<string, unknown>([
    ['two-sum', {
      fetchedAt: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days — stale, triggers background refresh
      id: 1, title: 'Two Sum', difficulty: 'Easy',
      url: 'https://leetcode.com/problems/two-sum/',
      contentHtml: '<p>old</p>', topicSlugs: [],
    }],
  ]);
  void existingStatus; // referenced via seedFrontmatter in the test
  return {
    getProblemsFolder: () => 'LeetCode',
    setProblemsFolder: async () => undefined,
    getDefaultLanguage: () => 'python3',
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

describe('NoteWriter.openProblem status plumbing (GAP-2a, NOTE-03, D-04)', () => {
  it("initialStatus='solved' → new note's frontmatter has lc-status: accepted", async () => {
    const m = makeMockVaultApp({});
    const client = makeMockLeetCodeClient({ detail: makeMockDetail(1, 'two-sum') });
    const writer = new NoteWriter(m.app as never, client as never, makeEmptySettings() as never);
    await writer.openProblem('two-sum', 'solved');
    const fm = m.getFrontmatter('LeetCode/1-two-sum.md');
    expect(fm!['lc-status']).toBe('accepted');
  });

  it("initialStatus='attempted' → new note's frontmatter has lc-status: attempted", async () => {
    const m = makeMockVaultApp({});
    const client = makeMockLeetCodeClient({ detail: makeMockDetail(1, 'two-sum') });
    const writer = new NoteWriter(m.app as never, client as never, makeEmptySettings() as never);
    await writer.openProblem('two-sum', 'attempted');
    const fm = m.getFrontmatter('LeetCode/1-two-sum.md');
    expect(fm!['lc-status']).toBe('attempted');
  });

  it("initialStatus='untouched' → new note's frontmatter has lc-status: untouched", async () => {
    const m = makeMockVaultApp({});
    const client = makeMockLeetCodeClient({ detail: makeMockDetail(1, 'two-sum') });
    const writer = new NoteWriter(m.app as never, client as never, makeEmptySettings() as never);
    await writer.openProblem('two-sum', 'untouched');
    const fm = m.getFrontmatter('LeetCode/1-two-sum.md');
    expect(fm!['lc-status']).toBe('untouched');
  });

  it('no 2nd arg (back-compat) → new note has lc-status: untouched', async () => {
    const m = makeMockVaultApp({});
    const client = makeMockLeetCodeClient({ detail: makeMockDetail(1, 'two-sum') });
    const writer = new NoteWriter(m.app as never, client as never, makeEmptySettings() as never);
    await writer.openProblem('two-sum');
    const fm = m.getFrontmatter('LeetCode/1-two-sum.md');
    expect(fm!['lc-status']).toBe('untouched');
  });

  it('D-04 end-to-end: background-refresh on a stale cache MUST NOT downgrade an existing lc-status: accepted', async () => {
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': '## Problem\nold.\n\n## Notes\n' });
    // Seed the existing note with lc-status: accepted (Phase 4 wrote this previously).
    m.seedFrontmatter('LeetCode/1-two-sum.md', { 'lc-status': 'accepted' });
    const client = makeMockLeetCodeClient({ detail: makeMockDetail(1, 'two-sum') });
    const writer = new NoteWriter(m.app as never, client as never, makeStaleCacheSettings('accepted') as never);

    // Re-open with an 'untouched' hint — simulates a logged-in user whose LC
    // row says 'notac' even though they already solved on this device. The
    // D-04 guard must keep the existing 'accepted' value.
    await writer.openProblem('two-sum', 'untouched');

    // Let the background refresh promise settle.
     
    await new Promise((r) => window.setTimeout(r, 20));

    const fm = m.getFrontmatter('LeetCode/1-two-sum.md');
    expect(fm!['lc-status']).toBe('accepted');
  });
});
