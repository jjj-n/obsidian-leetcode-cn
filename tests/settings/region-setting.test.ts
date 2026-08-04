// tests/settings/region-setting.test.ts
// Ticket #1: Region setting + URL resolution.
// Shape-guard + getter/setter + region-aware URL helpers.
import { describe, it, expect, vi } from 'vitest';
import { SettingsStore } from '../../src/settings/SettingsStore';

function makeMockPlugin(initial: unknown = null) {
  const state: { data: unknown } = { data: initial };
  return {
    loadData: vi.fn(async () => state.data),
    saveData: vi.fn(async (d: unknown) => { state.data = d; }),
  };
}

describe('SettingsStore — region field', () => {
  it('defaults to "cn" on fresh install', async () => {
    const plugin = makeMockPlugin(null);
    const s = await SettingsStore.load(plugin as never);
    expect(s.getRegion()).toBe('cn');
  });

  it('round-trip: setRegion("com") then getRegion()', async () => {
    const plugin = makeMockPlugin(null);
    const s = await SettingsStore.load(plugin as never);
    await s.setRegion('com');
    expect(s.getRegion()).toBe('com');
    expect(plugin.saveData).toHaveBeenCalled();
  });

  it('preserves existing region value from data.json', async () => {
    const plugin = makeMockPlugin({ version: 1, region: 'com' });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getRegion()).toBe('com');
  });

  it('preserves "cn" region from data.json', async () => {
    const plugin = makeMockPlugin({ version: 1, region: 'cn' });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getRegion()).toBe('cn');
  });
});

describe('SettingsStore.load — region shape-guard', () => {
  it('collapses missing region to default "cn"', async () => {
    const plugin = makeMockPlugin({ version: 1 });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getRegion()).toBe('cn');
  });

  it('collapses non-string region to default "cn"', async () => {
    const plugin = makeMockPlugin({ version: 1, region: 42 });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getRegion()).toBe('cn');
  });

  it('collapses unknown string region to default "cn"', async () => {
    const plugin = makeMockPlugin({ version: 1, region: 'eu' });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getRegion()).toBe('cn');
  });

  it('collapses null region to default "cn"', async () => {
    const plugin = makeMockPlugin({ version: 1, region: null });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getRegion()).toBe('cn');
  });
});

describe('SettingsStore — region-aware URL helpers', () => {
  it('getBaseUrl() returns leetcode.cn when region is cn', async () => {
    const plugin = makeMockPlugin({ version: 1, region: 'cn' });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getBaseUrl()).toBe('https://leetcode.cn');
  });

  it('getBaseUrl() returns leetcode.com when region is com', async () => {
    const plugin = makeMockPlugin({ version: 1, region: 'com' });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getBaseUrl()).toBe('https://leetcode.com');
  });

  it('getLoginUrl() returns cn login URL', async () => {
    const plugin = makeMockPlugin({ version: 1, region: 'cn' });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getLoginUrl()).toBe('https://leetcode.cn/accounts/login/');
  });

  it('getLoginUrl() returns com login URL', async () => {
    const plugin = makeMockPlugin({ version: 1, region: 'com' });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getLoginUrl()).toBe('https://leetcode.com/accounts/login/');
  });

  it('getProblemUrl(slug) returns cn problem URL', async () => {
    const plugin = makeMockPlugin({ version: 1, region: 'cn' });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getProblemUrl('two-sum')).toBe('https://leetcode.cn/problems/two-sum/');
  });

  it('getProblemUrl(slug) returns com problem URL', async () => {
    const plugin = makeMockPlugin({ version: 1, region: 'com' });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getProblemUrl('two-sum')).toBe('https://leetcode.com/problems/two-sum/');
  });
});
