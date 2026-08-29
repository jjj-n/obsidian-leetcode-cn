import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProblemListService, PAGE_SIZE, INDEX_TTL_MS } from '../src/browse/ProblemListService';
import type { ProblemIndex } from '../src/browse/types';

function makeMockQuestion(
  n: number,
  diff: 'Easy' | 'Medium' | 'Hard' = 'Easy',
  status: 'ac' | 'notac' | null = null,
) {
  return {
    questionFrontendId: String(n),
    titleSlug: `problem-${n}`,
    title: `Problem ${n}`,
    titleCn: '',
    difficulty: diff,
    isPaidOnly: false,
    status,
  };
}

/** Mock client exposing the unified getProblemListPage() surface.
 *  `pages[i]` = row count of page i; `total` = LC-reported total (null = unknown). */
function makeMockClient(pages: number[], total: number | null = null) {
  const getProblemListPage = vi.fn(async ({ skip }: { limit: number; skip: number }) => {
    const pageIdx = skip / PAGE_SIZE;
    const count = pages[pageIdx] ?? 0;
    const start = skip + 1;
    // Rotate statuses to assert mapping logic covers all three buckets.
    const rot: Array<'ac' | 'notac' | null> = ['ac', 'notac', null];
    return {
      questions: Array.from({ length: count }, (_, i) =>
        makeMockQuestion(start + i, 'Easy', rot[(start + i) % 3])),
      total,
    };
  });
  return { getProblemListPage };
}

function makeMockSettings(
  initial: ProblemIndex | null = null,
  region: 'cn' | 'com' = 'cn',
) {
  let index: ProblemIndex | null = initial;
  return {
    getRegion: vi.fn(() => region),
    getProblemIndex: vi.fn(() => index),
    setProblemIndex: vi.fn(async (i: ProblemIndex) => { index = i; }),
  };
}

describe('ProblemListService.refresh (BROWSE-02)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('paginates 50/50/7 → 107 items total, stops after short page', async () => {
    const client = makeMockClient([50, 50, 7]);
    const settings = makeMockSettings(null);
    const svc = new ProblemListService(client as never, settings as never);
    const result = await svc.refresh(true);

    expect(result).toHaveLength(107);
    expect(client.getProblemListPage).toHaveBeenCalledTimes(3);
    expect(client.getProblemListPage).toHaveBeenNthCalledWith(1, { limit: PAGE_SIZE, skip: 0 });
    expect(client.getProblemListPage).toHaveBeenNthCalledWith(2, { limit: PAGE_SIZE, skip: 50 });
    expect(client.getProblemListPage).toHaveBeenNthCalledWith(3, { limit: PAGE_SIZE, skip: 100 });
  });

  it('stops on the reported total when the last page is exactly PAGE_SIZE (cn shape)', async () => {
    // One full page + total=50: the short-page signal never fires; the total
    // check must terminate the loop after page 1.
    const client = makeMockClient([50], 50);
    const settings = makeMockSettings(null);
    const svc = new ProblemListService(client as never, settings as never);
    const result = await svc.refresh(true);

    expect(result).toHaveLength(50);
    expect(client.getProblemListPage).toHaveBeenCalledTimes(1);
  });

  it('maps titleCn and frontendId onto IndexedProblem rows', async () => {
    const client = {
      getProblemListPage: vi.fn(async () => ({
        questions: [
          {
            questionFrontendId: '1',
            titleSlug: 'two-sum',
            title: 'Two Sum',
            titleCn: '两数之和',
            difficulty: 'Easy',
            isPaidOnly: false,
            status: 'ac',
          },
          {
            questionFrontendId: 'LCR 007',
            titleSlug: '3sum-lcr',
            title: '3Sum LCR',
            titleCn: '',
            difficulty: 'Medium',
            isPaidOnly: true,
            status: null,
          },
        ],
        total: 2,
      })),
    };
    const settings = makeMockSettings(null);
    const svc = new ProblemListService(client as never, settings as never);
    const result = await svc.refresh(true);

    expect(result[0]).toMatchObject({
      frontendId: '1', titleCn: '两数之和', status: 'solved',
    });
    // "LCR 007" does not parse to a number — the verbatim frontendId must be
    // preserved so views can render it instead of NaN.
    expect(result[1]).toMatchObject({
      id: Number.NaN, frontendId: 'LCR 007', titleCn: undefined, status: 'untouched', paid: true,
    });
  });

  it('persists the fetched index via SettingsStore, with status populated on every row', async () => {
    const client = makeMockClient([50, 7]);
    const settings = makeMockSettings(null);
    const svc = new ProblemListService(client as never, settings as never);
    await svc.refresh(true);

    expect(settings.setProblemIndex).toHaveBeenCalledTimes(1);
    const firstCall = settings.setProblemIndex.mock.calls[0];
    if (!firstCall) throw new Error('setProblemIndex was not called');
    const call = firstCall[0];
    expect(call.problems).toHaveLength(57);
    expect(call.fetchedAt).toBeGreaterThan(0);
    // Every row must have a defined status in the canonical vocabulary.
    for (const p of call.problems) {
      expect(['solved', 'attempted', 'untouched']).toContain(p.status);
    }
    // At least one of each bucket should be present given our rotating mock.
    const uniq = new Set(call.problems.map((p) => p.status));
    expect(uniq.has('solved')).toBe(true);
    expect(uniq.has('attempted')).toBe(true);
    expect(uniq.has('untouched')).toBe(true);
  });

  it('returns cached index when fresh (<24h) without calling network', async () => {
    const fresh: ProblemIndex = {
      fetchedAt: Date.now() - 1000,
      region: 'cn',
      problems: [{ id: 1, slug: 'two-sum', title: 'Two Sum', diff: 'Easy', paid: false }],
    };
    const client = makeMockClient([50]);
    const settings = makeMockSettings(fresh);
    const svc = new ProblemListService(client as never, settings as never);
    const result = await svc.refresh(false);

    expect(result).toEqual(fresh.problems);
    expect(client.getProblemListPage).toHaveBeenCalledTimes(0);
  });

  it('treats a chronologically-fresh cache from the OTHER region as stale', async () => {
    // cn ↔ com switch: the cached index describes a different problemset —
    // must re-fetch even though fetchedAt is 1s ago.
    const foreign: ProblemIndex = {
      fetchedAt: Date.now() - 1000,
      region: 'com',
      problems: [{ id: 999, slug: 'com-only', title: 'Com Only', diff: 'Easy', paid: false }],
    };
    const client = makeMockClient([3]);
    const settings = makeMockSettings(foreign, 'cn');
    const svc = new ProblemListService(client as never, settings as never);
    const result = await svc.refresh(false);

    expect(client.getProblemListPage).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(3);
  });

  it('treats a legacy cache without a region tag as stale, then tags the fresh index', async () => {
    const legacy: ProblemIndex = {
      fetchedAt: Date.now() - 1000,
      problems: [{ id: 1, slug: 'two-sum', title: 'Two Sum', diff: 'Easy', paid: false }],
    };
    const client = makeMockClient([3]);
    const settings = makeMockSettings(legacy, 'cn');
    const svc = new ProblemListService(client as never, settings as never);
    await svc.refresh(false);

    expect(client.getProblemListPage).toHaveBeenCalledTimes(1);
    expect(settings.setProblemIndex).toHaveBeenCalledWith(
      expect.objectContaining({ region: 'cn' }),
    );
  });

  it('re-fetches when cache is stale (>24h)', async () => {
    const stale: ProblemIndex = {
      fetchedAt: Date.now() - INDEX_TTL_MS - 1000,
      problems: [{ id: 999, slug: 'stale', title: 'Stale', diff: 'Easy', paid: false }],
    };
    const client = makeMockClient([10]);
    const settings = makeMockSettings(stale);
    const svc = new ProblemListService(client as never, settings as never);
    const result = await svc.refresh(false);

    expect(client.getProblemListPage).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(10);
  });

  it('fetches on first run when no cache exists (non-force)', async () => {
    const client = makeMockClient([3]);
    const settings = makeMockSettings(null);
    const svc = new ProblemListService(client as never, settings as never);
    const result = await svc.refresh(false);

    expect(client.getProblemListPage).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(3);
  });

  it('emits progress ticks carrying the reported total (cn first page knows it)', async () => {
    const client = makeMockClient([50, 10], 60);
    const settings = makeMockSettings(null);
    const svc = new ProblemListService(client as never, settings as never);
    const ticks: Array<{ loaded: number; total: number | null; done: boolean }> = [];
    await svc.refresh(true, (p) => ticks.push({ loaded: p.loaded, total: p.total, done: p.done }));

    expect(ticks).toEqual([
      { loaded: 50, total: 60, done: false },
      { loaded: 60, total: 60, done: true },
    ]);
  });

  it('single-flight: concurrent refresh() calls share one paginate pass (WR-03)', async () => {
    const client = makeMockClient([50, 50, 7]);
    const settings = makeMockSettings(null);
    const svc = new ProblemListService(client as never, settings as never);
    // Kick off two concurrent refreshes WITHOUT awaiting between them.
    // Without the single-flight guard, both would race and issue ~6 total
    // fetches (3 pages each). With the guard, only 3 fetches total fire.
    const [a, b] = await Promise.all([svc.refresh(true), svc.refresh(true)]);
    expect(client.getProblemListPage).toHaveBeenCalledTimes(3);
    expect(a).toBe(b); // same resolved array reference
    expect(a).toHaveLength(107);
  });

  it('single-flight: a second refresh after the first settles does fetch again', async () => {
    const client = makeMockClient([3]);
    const settings = makeMockSettings(null);
    const svc = new ProblemListService(client as never, settings as never);
    await svc.refresh(true);
    await svc.refresh(true);
    // Two sequential (awaited) calls → two paginate passes (1 page each).
    expect(client.getProblemListPage).toHaveBeenCalledTimes(2);
  });
});
