// tests/browse/ProblemListService.premium.test.ts
//
// Premium-rule multi-select semantics in the compound filter evaluator
// (implemented, previously planned as Phase 5.2 D-03):
//   - values = []                          → rule is a no-op (evaluator undefined)
//   - values = ['premium']                 → only paid rows match
//   - values = ['non-premium']             → only free rows match
//   - values = ['premium', 'non-premium']  → both match (effectively no-op)

import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

import type { IndexedProblem } from '../../src/browse/types';

function makeRow(overrides: Partial<IndexedProblem> = {}): IndexedProblem {
  return {
    id: 1,
    slug: 'two-sum',
    title: 'Two Sum',
    diff: 'Easy',
    paid: false,
    status: 'untouched',
    ...overrides,
  };
}

describe('ProblemListService premium multi-select', () => {
  // Empty values array is a no-op. The evaluator returns `undefined` so the
  // surrounding `applyCompoundFilter` treats it as "skip this rule", not
  // "rule failed".
  it('D-03: values=[] → rule is no-op (evaluator returns undefined)', async () => {
    const mod = (await import('../../src/browse/ProblemListService')) as unknown as {
      evaluateRule?: (row: IndexedProblem, rule: unknown) => boolean | undefined;
    };
    if (typeof mod.evaluateRule !== 'function') {
      throw new Error('evaluateRule not exported — 05.2-03 must export it');
    }
    const rule = { field: 'premium', op: 'is', values: [] };
    expect(mod.evaluateRule(makeRow({ paid: true }), rule)).toBeUndefined();
    expect(mod.evaluateRule(makeRow({ paid: false }), rule)).toBeUndefined();
  });

  // D-03 — both values present: every row passes. Implementation detail: the
  // evaluator may return `true` or `undefined` (both match semantically), but
  // we assert the user-visible outcome via applyCompoundFilter to pin the
  // behavior users actually experience.
  it("D-03: values=['premium','non-premium'] → both paid and free pass", async () => {
    const { ProblemListService } = (await import('../../src/browse/ProblemListService')) as unknown as {
      ProblemListService: new (...args: unknown[]) => {
        applyCompoundFilter: (idx: IndexedProblem[], f: unknown) => IndexedProblem[];
      };
    };
    // Construct without client/settings — applyCompoundFilter is pure over its
    // input array; the constructor dependencies are only used by refresh().
    const svc = new ProblemListService(null as never, null as never);
    const rows = [makeRow({ paid: true, id: 1 }), makeRow({ paid: false, id: 2 })];
    const filter = {
      match: 'all' as const,
      rules: [{ field: 'premium', op: 'is', values: ['premium', 'non-premium'] }],
    };
    const out = svc.applyCompoundFilter(rows, filter);
    expect(out.map((r) => r.id).sort()).toEqual([1, 2]);
  });

  // D-03 — only non-premium selected: paid rows dropped.
  it("D-03: values=['non-premium'] → only free (paid=false) rows pass", async () => {
    const { ProblemListService } = (await import('../../src/browse/ProblemListService')) as unknown as {
      ProblemListService: new (...args: unknown[]) => {
        applyCompoundFilter: (idx: IndexedProblem[], f: unknown) => IndexedProblem[];
      };
    };
    const svc = new ProblemListService(null as never, null as never);
    const rows = [makeRow({ paid: true, id: 1 }), makeRow({ paid: false, id: 2 })];
    const filter = {
      match: 'all' as const,
      rules: [{ field: 'premium', op: 'is', values: ['non-premium'] }],
    };
    const out = svc.applyCompoundFilter(rows, filter);
    expect(out.map((r) => r.id)).toEqual([2]);
  });
});
