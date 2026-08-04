// tests/note-writer-force-refresh.test.ts
// GAP-11: NoteWriter.forceRefresh() — exercised by the "Refresh current problem"
// command palette entry. Covers the four branches called out in 02-10 task 2:
//   1. Happy path — stale cache + force refresh → vault.process called,
//      applyFrontmatter called, user `## Notes` body preserved.
//   2. No note found — Notice fires, no network fetch attempted.
//   3. Network failure — Notice fires, note left unchanged on disk.
//   4. Cache invalidation — after force refresh, the cached `fetchedAt`
//      timestamp is fresh (Date.now()), so a subsequent background-refresh
//      path treats the entry as non-stale.
import { describe, it, expect, vi } from 'vitest';
import { makeMockVaultApp } from './helpers/mock-vault';
import { makeMockLeetCodeClient, makeMockDetail } from './helpers/mock-leetcode-client';
import { NoteWriter, CACHE_TTL_MS } from '../src/notes/NoteWriter';

// Capture Notice constructions via a module mock (same pattern as
// re-open-silent-offline.test.ts / new-note-fetch-failure.test.ts).
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

interface DetailShape {
  fetchedAt: number;
  id: number;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  url: string;
  contentHtml: string;
  topicSlugs: string[];
}

function makeSettingsWithCache(entry: DetailShape | null) {
  const details = new Map<string, DetailShape>();
  if (entry) details.set('two-sum', entry);
  return {
    details,
    getProblemsFolder: () => 'LeetCode',
    setProblemsFolder: async () => undefined,
    getDefaultLanguage: () => 'python3',
    setDefaultLanguage: async () => undefined,
    getRegion: () => 'cn' as const,
    getProblemDetail: (slug: string) => details.get(slug) ?? null,
    setProblemDetail: async (slug: string, d: DetailShape) => { details.set(slug, d); },
    pruneProblemDetails: async () => 0,
  };
}

const STALE_ENTRY: DetailShape = {
  fetchedAt: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10 days — well past TTL
  id: 1,
  title: 'Two Sum',
  difficulty: 'Easy',
  url: 'https://leetcode.com/problems/two-sum/',
  contentHtml: '<p>stale content</p>',
  topicSlugs: [],
};

describe('NoteWriter.forceRefresh (GAP-11)', () => {
  it('happy path: stale cache + existing note → rewrites `## Problem`, preserves `## Notes`, updates frontmatter', async () => {
    noticeSpy.mockClear();
    const userBody = [
      '## Problem',
      'old stale statement here.',
      '',
      '## Notes',
      'My personal solution sketch.',
      'DO NOT lose this.',
      '',
    ].join('\n');
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': userBody });
    const settings = makeSettingsWithCache(STALE_ENTRY);
    // Fresh detail returns new HTML content — force refresh should rewrite
    // the `## Problem` section to reflect this.
    const fresh = makeMockDetail(1, 'two-sum', {
      content: '<p>FRESH problem statement.</p>',
      topicTags: [{ name: 'Array', slug: 'array' }],
    });
    const client = makeMockLeetCodeClient({ detail: fresh });

    const writer = new NoteWriter(m.app as never, client as never, settings as never);
    await writer.forceRefresh('two-sum');

    // Network fetch fired (bypassed TTL).
    expect(client.getProblemDetail).toHaveBeenCalledWith('two-sum');
    // vault.process was invoked to rewrite the body.
    expect(m.spies.process).toHaveBeenCalled();
    // processFrontMatter was invoked (frontmatter update via applyFrontmatter).
    expect(m.spies.processFrontMatter).toHaveBeenCalled();

    // User's `## Notes` content survives; plugin's `## Problem` section was
    // replaced with the fresh HTML-converted content.
    const newBody = m.getContent('LeetCode/1-two-sum.md') ?? '';
    expect(newBody).toContain('FRESH problem statement.');
    expect(newBody).toContain('My personal solution sketch.');
    expect(newBody).toContain('DO NOT lose this.');
    expect(newBody).not.toContain('old stale statement here.');

    // No error Notice fired.
    const errorNotices = noticeSpy.mock.calls.filter(([msg]) =>
      /couldn.?t|no note|not found|expired/i.test(String(msg)),
    );
    expect(errorNotices).toHaveLength(0);
  });

  it('no existing note → fires `No note for problem` Notice, does NOT hit network', async () => {
    noticeSpy.mockClear();
    // Vault has no file for this slug AND cache is empty, so buildNotePath
    // can't resolve either way. Also testing the "cache present but file
    // missing" pathway below.
    const m = makeMockVaultApp({}); // empty vault
    const settings = makeSettingsWithCache(null);
    const client = makeMockLeetCodeClient({ detail: makeMockDetail(1, 'two-sum') });
    const writer = new NoteWriter(m.app as never, client as never, settings as never);

    await writer.forceRefresh('two-sum');

    // No network call attempted.
    expect(client.getProblemDetail).not.toHaveBeenCalled();
    // User-facing Notice fired.
    const matched = noticeSpy.mock.calls.find(([msg]) => /no note for problem/i.test(String(msg)));
    expect(matched).toBeDefined();
    // No vault writes.
    expect(m.spies.process).not.toHaveBeenCalled();
    expect(m.spies.processFrontMatter).not.toHaveBeenCalled();
  });

  it('cache present but file deleted → fires Notice, no network call', async () => {
    noticeSpy.mockClear();
    // Cache entry exists (so buildNotePath resolves to 'LeetCode/1-two-sum.md')
    // but the vault file isn't there anymore (user deleted it).
    const m = makeMockVaultApp({}); // empty vault
    const settings = makeSettingsWithCache(STALE_ENTRY);
    const client = makeMockLeetCodeClient({ detail: makeMockDetail(1, 'two-sum') });
    const writer = new NoteWriter(m.app as never, client as never, settings as never);

    await writer.forceRefresh('two-sum');

    expect(client.getProblemDetail).not.toHaveBeenCalled();
    const matched = noticeSpy.mock.calls.find(([msg]) => /no note for problem/i.test(String(msg)));
    expect(matched).toBeDefined();
  });

  it('network failure → fires `Couldn\'t refresh` Notice, note unchanged', async () => {
    noticeSpy.mockClear();
    const originalBody = '## Problem\nkept verbatim\n\n## Notes\nUser content\n';
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': originalBody });
    const settings = makeSettingsWithCache(STALE_ENTRY);
    const client = makeMockLeetCodeClient({ throwOn: 'network' });

    const writer = new NoteWriter(m.app as never, client as never, settings as never);
    await writer.forceRefresh('two-sum');

    // Network attempt was made and failed.
    expect(client.getProblemDetail).toHaveBeenCalledWith('two-sum');
    // Notice copy matches the D-13-style "Couldn't refresh {title}" pattern.
    const matched = noticeSpy.mock.calls.find(([msg]) => /couldn.?t refresh/i.test(String(msg)));
    expect(matched).toBeDefined();
    // The title (not the slug) should appear in the Notice since cache has it.
    expect(String(matched?.[0])).toContain('Two Sum');
    // Body on disk unchanged.
    expect(m.getContent('LeetCode/1-two-sum.md')).toBe(originalBody);
    // Frontmatter untouched (processFrontMatter never called on this path).
    expect(m.spies.processFrontMatter).not.toHaveBeenCalled();
  });

  it('session expired → fires session-expired Notice instead of generic network Notice', async () => {
    // Phase 5 Plan 03 D-21 migrated session-expired Notices to a
    // DocumentFragment-based helper. Accept either legacy string or new
    // fragment; both carry the CF-04 copy verbatim.
    noticeSpy.mockClear();
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': '## Problem\nold\n\n## Notes\n' });
    const settings = makeSettingsWithCache(STALE_ENTRY);
    const client = makeMockLeetCodeClient({ throwOn: 'session-expiry' });

    const writer = new NoteWriter(m.app as never, client as never, settings as never);
    await writer.forceRefresh('two-sum');

    const matched = noticeSpy.mock.calls.find(([msg]) => {
      if (typeof msg === 'string') return /session expired/i.test(msg);
      if (msg instanceof DocumentFragment) {
        const host = document.createElement('div');
        host.appendChild(msg.cloneNode(true));
        return /session expired/i.test(host.textContent ?? '');
      }
      return false;
    });
    expect(matched).toBeDefined();
    expect(m.spies.processFrontMatter).not.toHaveBeenCalled();
  });

  it('LC returns null detail → fires `problem not found` Notice, no writes', async () => {
    noticeSpy.mockClear();
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': '## Problem\nold\n\n## Notes\n' });
    const settings = makeSettingsWithCache(STALE_ENTRY);
    const client = makeMockLeetCodeClient({ detail: null });

    const writer = new NoteWriter(m.app as never, client as never, settings as never);
    await writer.forceRefresh('two-sum');

    const matched = noticeSpy.mock.calls.find(([msg]) => /not found/i.test(String(msg)));
    expect(matched).toBeDefined();
    expect(m.spies.process).not.toHaveBeenCalled();
  });

  it('cache invalidation: after force refresh, fetchedAt is fresh (non-stale)', async () => {
    noticeSpy.mockClear();
    const m = makeMockVaultApp({ 'LeetCode/1-two-sum.md': '## Problem\nold\n\n## Notes\n' });
    const settings = makeSettingsWithCache(STALE_ENTRY);
    const fresh = makeMockDetail(1, 'two-sum', {
      content: '<p>refreshed</p>',
    });
    const client = makeMockLeetCodeClient({ detail: fresh });

    const writer = new NoteWriter(m.app as never, client as never, settings as never);
    const before = Date.now();
    await writer.forceRefresh('two-sum');
    const after = Date.now();

    // Cache entry was replaced with a fresh fetchedAt in [before, after].
    const newCache = settings.details.get('two-sum');
    expect(newCache).toBeDefined();
    expect(newCache!.fetchedAt).toBeGreaterThanOrEqual(before);
    expect(newCache!.fetchedAt).toBeLessThanOrEqual(after);
    // And critically, the new fetchedAt is within the TTL (background-refresh
    // would now see it as fresh and skip the network on a subsequent open).
    expect(Date.now() - newCache!.fetchedAt).toBeLessThan(CACHE_TTL_MS);
  });
});
