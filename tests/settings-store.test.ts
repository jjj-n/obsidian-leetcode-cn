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

describe('SettingsStore — Phase 4 backward-compat (GRAPH-05, D-12, D-15, D-21)', () => {
  it('autoBacklinksEnabled defaults true when absent from data.json', async () => {
    // Pitfall 9: pre-Phase-4 data.json has no `autoBacklinksEnabled` key.
    // Must fall back to default `true` (D-21 — headline value is on).
    const plugin = makeMockPlugin({
      version: 1,
      auth: { LEETCODE_SESSION: 'X', csrftoken: 'Y' },
      problemsFolder: 'LeetCode',
    });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getAutoBacklinksEnabled()).toBe(true);
  });

  it('autoBacklinksEnabled shape-guard rejects non-boolean', async () => {
    // T-04-02-02 threat mitigation: malicious non-boolean → default true.
    const plugin = makeMockPlugin({
      version: 1,
      autoBacklinksEnabled: 'yes',  // malformed
    });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getAutoBacklinksEnabled()).toBe(true);
  });

  it('autoBacklinksEnabled round-trip: setter persists false', async () => {
    const plugin = makeMockPlugin(null);
    const s = await SettingsStore.load(plugin as never);
    expect(s.getAutoBacklinksEnabled()).toBe(true);
    await s.setAutoBacklinksEnabled(false);
    expect(s.getAutoBacklinksEnabled()).toBe(false);
    expect(plugin.saveData).toHaveBeenCalled();
  });

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

  it('getTechniquesFolder derives from problemsFolder', async () => {
    // D-15 derived getter — no new settings field. Respects the
    // sanitizeFolder no-trailing-slash invariant (Phase 1 D-10).
    const plugin = makeMockPlugin({ version: 1, problemsFolder: 'LeetCode' });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getTechniquesFolder()).toBe('LeetCode/Techniques');

    const plugin2 = makeMockPlugin({ version: 1, problemsFolder: 'my notes/leetcode' });
    const s2 = await SettingsStore.load(plugin2 as never);
    expect(s2.getTechniquesFolder()).toBe('my notes/leetcode/Techniques');
  });
});

describe('SettingsStore — techniquesFolderOverride round-trip (Phase 5 POLISH-01 D-15)', () => {
  it('defaults to empty string when field absent (pre-Phase-5 data.json)', async () => {
    // A pre-Phase-5 data.json has no `techniquesFolderOverride` key. Must fall
    // back to '' so getTechniquesFolder() uses the derived default and Phase 4
    // users see no behavior change.
    const plugin = makeMockPlugin({ version: 1, problemsFolder: 'LeetCode' });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getTechniquesFolderOverride()).toBe('');
  });

  it('shape-guard coerces non-string raw to empty string', async () => {
    // T-05-02-01 threat mitigation — malicious data.json with non-string
    // override (object, number, null) reverts to '' (= derived default).
    const pluginObj = makeMockPlugin({
      version: 1,
      problemsFolder: 'LeetCode',
      techniquesFolderOverride: { evil: 'obj' } as unknown,
    });
    const sObj = await SettingsStore.load(pluginObj as never);
    expect(sObj.getTechniquesFolderOverride()).toBe('');

    const pluginNum = makeMockPlugin({
      version: 1,
      problemsFolder: 'LeetCode',
      techniquesFolderOverride: 42 as unknown,
    });
    const sNum = await SettingsStore.load(pluginNum as never);
    expect(sNum.getTechniquesFolderOverride()).toBe('');

    const pluginNull = makeMockPlugin({
      version: 1,
      problemsFolder: 'LeetCode',
      techniquesFolderOverride: null as unknown,
    });
    const sNull = await SettingsStore.load(pluginNull as never);
    expect(sNull.getTechniquesFolderOverride()).toBe('');
  });

  it('setTechniquesFolderOverride persists via saveData round-trip', async () => {
    const plugin = makeMockPlugin(null);
    const s = await SettingsStore.load(plugin as never);
    expect(s.getTechniquesFolderOverride()).toBe('');
    await s.setTechniquesFolderOverride('Library/LC Techniques');
    expect(s.getTechniquesFolderOverride()).toBe('Library/LC Techniques');
    expect(plugin.saveData).toHaveBeenCalled();
  });

  it('getTechniquesFolder returns override verbatim when non-empty', async () => {
    // D-15 — override takes precedence over the derived default.
    const plugin = makeMockPlugin({
      version: 1,
      problemsFolder: 'LeetCode',
      techniquesFolderOverride: 'Library/LC Techniques',
    });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getTechniquesFolder()).toBe('Library/LC Techniques');
  });

  it('getTechniquesFolder returns derived default when override is empty', async () => {
    // D-15 — empty override string = use `{problemsFolder}/Techniques`.
    const plugin = makeMockPlugin({
      version: 1,
      problemsFolder: 'LeetCode',
      techniquesFolderOverride: '',
    });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getTechniquesFolder()).toBe('LeetCode/Techniques');
  });

  it('setter accepts raw input without stripping (UI layer owns sanitization)', async () => {
    // Phase 4 convention: sanitization lives in the UI onChange handler.
    // Setter round-trips raw input verbatim so the UI can evolve without
    // double-stripping in the store.
    const plugin = makeMockPlugin(null);
    const s = await SettingsStore.load(plugin as never);
    await s.setTechniquesFolderOverride('custom/path');
    expect(s.getTechniquesFolderOverride()).toBe('custom/path');
  });
});
