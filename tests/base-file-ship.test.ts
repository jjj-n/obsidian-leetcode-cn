import { describe, it, expect } from 'vitest';
import { makeMockVaultApp } from './helpers/mock-vault';
import { ensureLeetcodeBase, leetcodeBaseYaml } from '../src/notes/BaseFile';

describe('ensureLeetcodeBase (D-17, D-18 ship-if-missing)', () => {
  it('creates LeetCode.base in the problems folder when it does not exist', async () => {
    const m = makeMockVaultApp({});
    await ensureLeetcodeBase(m.app as never, 'LeetCode');
    // createFolder runs first (folder did not exist) — optional depending on impl.
    expect(m.spies.create).toHaveBeenCalledWith('LeetCode/LeetCode.base', expect.any(String));
  });

  it('writes YAML that includes sort by created DESC', () => {
    const yaml = leetcodeBaseYaml('LeetCode');
    expect(yaml).toContain('property: created');
    expect(yaml).toMatch(/direction:\s*DESC/i);
  });

  it('YAML uses Obsidian 1.10+ schema: filters nested under the view (not top-level) with !note[...] .isEmpty() filter (GAP-6)', () => {
    const yaml = leetcodeBaseYaml('LeetCode');
    // Nested-under-view filter block (reverse-engineered from Obsidian UI).
    // The filters key must live INSIDE the view (indented under `  - type: table`),
    // not at top level — the latter is the v0.1.0 broken schema.
    expect(yaml).toMatch(/views:\s*\n\s*- type: table/);
    // Template v2: lc-slug is the only identity key — the filter keys off it.
    expect(yaml).toContain(`!note["lc-slug"].isEmpty()`);
    // Old broken expressions must be GONE.
    expect(yaml).not.toContain('file.inFolder(');
    expect(yaml).not.toContain('lc-id != null');
  });

  it('YAML references the template-v2 columns (分类, 难度, 情况, lc-status) and no retired keys', () => {
    const yaml = leetcodeBaseYaml('LeetCode');
    for (const col of ['分类', '难度', '情况', 'lc-status']) {
      expect(yaml).toContain(col);
    }
    for (const retired of ['lc-id', 'lc-title', 'lc-difficulty', 'lc-language']) {
      expect(yaml).not.toContain(retired);
    }
  });

  it('YAML ends with a trailing newline (POSIX convention)', () => {
    const yaml = leetcodeBaseYaml('LeetCode');
    expect(yaml.endsWith('\n')).toBe(true);
  });

  it('strips trailing slash from folder in path construction', async () => {
    const m = makeMockVaultApp({});
    await ensureLeetcodeBase(m.app as never, 'LeetCode/');
    expect(m.spies.create).toHaveBeenCalledWith('LeetCode/LeetCode.base', expect.any(String));
  });

  it('works with a custom folder path (filter is folder-agnostic in the new schema)', async () => {
    const m = makeMockVaultApp({});
    await ensureLeetcodeBase(m.app as never, 'Custom/Path');
    expect(m.spies.create).toHaveBeenCalledWith('Custom/Path/LeetCode.base', expect.any(String));
  });
});
