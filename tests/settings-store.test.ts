import { describe, it, expect, vi } from 'vitest';
import { SettingsStore } from '../src/settings/SettingsStore';

function makeMockPlugin(initial: unknown = null) {
  const state: { data: unknown } = { data: initial };
  return {
    loadData: vi.fn(async () => state.data),
    saveData: vi.fn(async (d: unknown) => { state.data = d; }),
  };
}

describe('SettingsStore (AUTH-03, AUTH-05, D-07, D-10)', () => {
  it('defaults: problemsFolder="LeetCode", defaultLanguage="java", auth=null', async () => {
    const plugin = makeMockPlugin(null);
    const s = await SettingsStore.load(plugin as never);
    expect(s.getAuthCookies()).toBeNull();
    expect(s.getProblemsFolder()).toBe('LeetCode');
    expect(s.getDefaultLanguage()).toBe('java');
    expect(s.getNoteFooter()).toBe('');
    expect(s.getProblemIndex()).toBeNull();
  });

  it('round-trip: setAuthCookies then getAuthCookies (AUTH-03)', async () => {
    const plugin = makeMockPlugin(null);
    const s = await SettingsStore.load(plugin as never);
    await s.setAuthCookies({ LEETCODE_SESSION: 'X', csrftoken: 'Y' });
    expect(s.getAuthCookies()).toEqual({ LEETCODE_SESSION: 'X', csrftoken: 'Y' });
    expect(plugin.saveData).toHaveBeenCalled();
  });

  it('logout: setAuthCookies(null) clears (AUTH-05)', async () => {
    const plugin = makeMockPlugin({ auth: { LEETCODE_SESSION: 'X', csrftoken: 'Y' }, version: 1 });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getAuthCookies()).toEqual({ LEETCODE_SESSION: 'X', csrftoken: 'Y' });
    await s.setAuthCookies(null);
    expect(s.getAuthCookies()).toBeNull();
  });

  it('preserves existing values when loading v1 data', async () => {
    const plugin = makeMockPlugin({
      version: 1,
      auth: { LEETCODE_SESSION: 'A', csrftoken: 'B' },
      username: 'user',
      problemsFolder: 'Custom',
      defaultLanguage: 'java',
      problemIndex: null,
    });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getUsername()).toBe('user');
    expect(s.getProblemsFolder()).toBe('Custom');
    expect(s.getDefaultLanguage()).toBe('java');
  });

  it('problem-index round-trip (D-07)', async () => {
    const plugin = makeMockPlugin(null);
    const s = await SettingsStore.load(plugin as never);
    const idx = {
      fetchedAt: 123,
      problems: [{ id: 1, slug: 'two-sum', title: 'Two Sum', diff: 'Easy' as const, paid: false }],
    };
    await s.setProblemIndex(idx);
    expect(s.getProblemIndex()).toEqual(idx);
  });
});

describe('SettingsStore.load — untrusted-disk validation (CR-02 / WR-04)', () => {
  it('rejects non-string LEETCODE_SESSION and falls back to logged-out state', async () => {
    const plugin = makeMockPlugin({
      version: 1,
      auth: { LEETCODE_SESSION: 1234, csrftoken: 'ok' },
    });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getAuthCookies()).toBeNull();
  });

  it('rejects auth that is missing csrftoken', async () => {
    const plugin = makeMockPlugin({
      version: 1,
      auth: { LEETCODE_SESSION: 'ok' },
    });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getAuthCookies()).toBeNull();
  });

  it('rejects problemsFolder containing `..` path-traversal', async () => {
    const plugin = makeMockPlugin({
      version: 1,
      problemsFolder: '../../.ssh',
    });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getProblemsFolder()).toBe('LeetCode');
  });

  it('rejects absolute problemsFolder path', async () => {
    const plugin = makeMockPlugin({
      version: 1,
      problemsFolder: '/etc/passwd',
    });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getProblemsFolder()).toBe('LeetCode');
  });

  it('strips trailing slash from a valid problemsFolder', async () => {
    const plugin = makeMockPlugin({
      version: 1,
      problemsFolder: 'Custom/Folder/',
    });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getProblemsFolder()).toBe('Custom/Folder');
  });

  it('rejects problemIndex where a problem is missing required `diff`', async () => {
    const plugin = makeMockPlugin({
      version: 1,
      problemIndex: {
        fetchedAt: 1,
        problems: [{ id: 1, slug: 'x', title: 'X', paid: false }], // no diff
      },
    });
    const s = await SettingsStore.load(plugin as never);
    // WR-04: reject the whole index to force a clean re-fetch rather than
    // render partial data that would crash renderRow on p.diff.toLowerCase().
    expect(s.getProblemIndex()).toBeNull();
  });

  it('rejects problemIndex with a non-array `problems` field', async () => {
    const plugin = makeMockPlugin({
      version: 1,
      problemIndex: { fetchedAt: 1, problems: 'not-an-array' },
    });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getProblemIndex()).toBeNull();
  });

  it('accepts a well-formed problemIndex untouched', async () => {
    const idx = {
      fetchedAt: 42,
      problems: [
        { id: 1, slug: 'two-sum', title: 'Two Sum', diff: 'Easy', paid: false, status: 'solved' },
      ],
    };
    const plugin = makeMockPlugin({ version: 1, problemIndex: idx });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getProblemIndex()).toEqual(idx);
  });

  it('rejects non-object raw disk data (e.g. a string) without crashing', async () => {
    const plugin = makeMockPlugin('garbage');
    const s = await SettingsStore.load(plugin as never);
    expect(s.getAuthCookies()).toBeNull();
    expect(s.getProblemsFolder()).toBe('LeetCode');
  });
});

describe('SettingsStore — DetailCacheEntry backward-compat (GRAPH-05, D-12, D-15)', () => {
  it('DetailCacheEntry.topicTags optional on old entries', async () => {
    // Pitfall 10: Phase 2-era entries with topicSlugs but no topicTags
    // remain VALID; the field is optional/undefined post-load.
    const oldEntry = {
      fetchedAt: 1,
      id: 1,
      title: 'Two Sum',
      difficulty: 'Easy',
      url: 'https://leetcode.com/problems/two-sum/',
      contentHtml: '<p>x</p>',
      topicSlugs: ['hash-table'],
      // no topicTags
    };
    const plugin = makeMockPlugin({
      version: 1,
      problemDetails: { 'two-sum': oldEntry },
    });
    const s = await SettingsStore.load(plugin as never);
    const detail = s.getProblemDetail('two-sum');
    expect(detail).not.toBeNull();
    expect(detail?.topicTags).toBeUndefined();
  });

  it('DetailCacheEntry.topicTags malformed entries dropped', async () => {
    // T-04-02-03 threat mitigation: topicTags present but elements missing
    // required `name`/`slug` string fields → reject whole entry (cache miss
    // triggers fresh fetch).
    const badEntry = {
      fetchedAt: 1,
      id: 1,
      title: 'Two Sum',
      difficulty: 'Easy',
      url: 'https://leetcode.com/problems/two-sum/',
      contentHtml: '<p>x</p>',
      topicSlugs: ['hash-table'],
      topicTags: [{ foo: 'bar' }],  // missing name/slug
    };
    const plugin = makeMockPlugin({
      version: 1,
      problemDetails: { 'two-sum': badEntry },
    });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getProblemDetail('two-sum')).toBeNull();
  });

  it('DetailCacheEntry.topicTags well-formed pairs accepted', async () => {
    const goodEntry = {
      fetchedAt: 1,
      id: 1,
      title: 'Two Sum',
      difficulty: 'Easy',
      url: 'https://leetcode.com/problems/two-sum/',
      contentHtml: '<p>x</p>',
      topicSlugs: ['hash-table', 'array'],
      topicTags: [
        { name: 'Hash Table', slug: 'hash-table' },
        { name: 'Array', slug: 'array' },
      ],
    };
    const plugin = makeMockPlugin({
      version: 1,
      problemDetails: { 'two-sum': goodEntry },
    });
    const s = await SettingsStore.load(plugin as never);
    const detail = s.getProblemDetail('two-sum');
    expect(detail).not.toBeNull();
    expect(detail?.topicTags).toEqual([
      { name: 'Hash Table', slug: 'hash-table' },
      { name: 'Array', slug: 'array' },
    ]);
  });
});
