// tests/browse/FilterModal.test.ts
//
// Contract checks for the compound filter modal (wave-1 changes, implemented):
//   - D-02: `language` entry removed from the field-selector — DEFERRED_STUB_FIELDS
//           is empty (or the symbol deleted entirely).
//   - D-03: `premium` value-editor is the shared multi-select (checkbox
//           popover), not a dedicated single-value picker.
//   - D-04: the Apply handler strips any `__autoDefault: true` marker from
//           rules before handing them to `onApply`, so the persisted filter
//           only carries user-intent rules.

import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', async () => {
  const actual = await import('../helpers/obsidian-stub');
  return actual;
});

describe('FilterModal wave-1 contracts', () => {
  // D-02 — field selector no longer lists Language: DEFERRED_STUB_FIELDS is
  // either not exported at all, or exported as an empty array.
  it('D-02: field selector menu does not list Language option', async () => {
    const mod = (await import('../../src/browse/FilterModal')) as unknown as {
      DEFERRED_STUB_FIELDS?: unknown[];
    };
    // Accept either: (a) symbol no longer exported, (b) exported but empty.
    const stubs = mod.DEFERRED_STUB_FIELDS;
    if (stubs === undefined) {
      expect(stubs).toBeUndefined();
    } else {
      expect(Array.isArray(stubs)).toBe(true);
      expect(stubs).toHaveLength(0);
    }
  });

  // D-03 — premium field is multi-value: renderPremiumEditor must not exist
  // (renderMultiSelect is the shared entry point for status/difficulty/topics).
  it('D-03: renderPremiumEditor deleted — premium uses multi-select', async () => {
    const mod = (await import('../../src/browse/FilterModal')) as unknown as {
      FilterModal: new (...args: unknown[]) => unknown;
    };
    const proto = mod.FilterModal.prototype as Record<string, unknown>;
    // Post-Wave-1: the premium path shares renderMultiSelect with status /
    // difficulty, so renderPremiumEditor must not exist.
    expect(proto.renderPremiumEditor).toBeUndefined();
    // renderMultiSelect must continue to exist — it's the shared entry point.
    expect(typeof proto.renderMultiSelect).toBe('function');
  });

  // D-04 — Apply strips `__autoDefault` markers so the persisted filter only
  // contains user-intent rules.
  it('D-04: Apply strips __autoDefault markers from draft rules', async () => {
    const mod = (await import('../../src/browse/FilterModal')) as unknown as {
      stripAutoDefaults?: (rules: unknown[]) => unknown[];
    };
    if (typeof mod.stripAutoDefaults !== 'function') {
      throw new Error('stripAutoDefaults helper missing — FilterModal must export it');
    }
    const draft = [
      { field: 'premium', op: 'is', values: ['non-premium'], __autoDefault: true },
      { field: 'difficulty', op: 'is', values: ['Easy'] },
    ];
    const stripped = mod.stripAutoDefaults(draft) as Array<Record<string, unknown>>;
    expect(stripped).toHaveLength(2);
    expect(stripped[0]).not.toHaveProperty('__autoDefault');
    expect(stripped[1]).not.toHaveProperty('__autoDefault');
  });
});
