// tests/settings/problem-index-fields.test.ts
// Guards for the problemIndex shape extensions added by the problem-browser
// wiring: per-row titleCn/frontendId optional strings, and the index-level
// region tag ('cn' | 'com' | absent for legacy caches).
import { describe, it, expect, vi } from 'vitest';
import { SettingsStore } from '../../src/settings/SettingsStore';

function makeMockPlugin(initial: unknown = null) {
  const state: { data: unknown } = { data: initial };
  return {
    loadData: vi.fn(async () => state.data),
    saveData: vi.fn(async (d: unknown) => { state.data = d; }),
  };
}

describe('SettingsStore problemIndex field guards', () => {
  it('round-trips rows with titleCn and frontendId, and a region tag', async () => {
    const plugin = makeMockPlugin(null);
    const s = await SettingsStore.load(plugin as never);
    const idx = {
      fetchedAt: 123,
      region: 'cn' as const,
      problems: [
        {
          id: 1, frontendId: '1', slug: 'two-sum', title: 'Two Sum', titleCn: '两数之和',
          diff: 'Easy' as const, paid: false, status: 'solved' as const,
        },
        {
          id: Number.NaN, frontendId: 'LCR 007', slug: '3sum-lcr', title: '3Sum LCR',
          diff: 'Medium' as const, paid: false,
        },
      ],
    };
    await s.setProblemIndex(idx);
    expect(s.getProblemIndex()).toEqual(idx);
  });

  it('rejects rows whose titleCn/frontendId are not strings', async () => {
    const plugin = makeMockPlugin({
      version: 1,
      problemIndex: {
        fetchedAt: 123,
        region: 'cn',
        problems: [
          { id: 1, slug: 'ok', title: 'Fine', diff: 'Easy', paid: false, titleCn: 42 },
          { id: 2, slug: 'also-ok', title: 'Fine 2', diff: 'Easy', paid: false, frontendId: ['7'] },
        ],
      },
    });
    const s = await SettingsStore.load(plugin as never);
    expect(s.getProblemIndex()).toBeNull();
  });

  it('rejects an unknown region tag but accepts absent (legacy)', async () => {
    const bad = makeMockPlugin({
      version: 1,
      problemIndex: {
        fetchedAt: 123, region: 'eu',
        problems: [{ id: 1, slug: 'two-sum', title: 'Two Sum', diff: 'Easy', paid: false }],
      },
    });
    expect((await SettingsStore.load(bad as never)).getProblemIndex()).toBeNull();

    const legacy = makeMockPlugin({
      version: 1,
      problemIndex: {
        fetchedAt: 123,
        problems: [{ id: 1, slug: 'two-sum', title: 'Two Sum', diff: 'Easy', paid: false }],
      },
    });
    const s = await SettingsStore.load(legacy as never);
    expect(s.getProblemIndex()?.region).toBeUndefined();
  });
});
