import { describe, it, expect } from 'vitest';
import { buildNoteFilename, buildNotePath } from '../src/notes/NoteTemplate';

// D-16 v2 (cn template): display-title filenames — `{id}. {题名}.md`.
describe('buildNoteFilename / buildNotePath', () => {
  it('produces display-title filenames like `1. 两数之和.md`', () => {
    expect(buildNoteFilename(1, '两数之和')).toBe('1. 两数之和.md');
    expect(buildNoteFilename(70, '爬楼梯')).toBe('70. 爬楼梯.md');
    // English fallback when cn has no translated title.
    expect(buildNoteFilename(1, 'Two Sum')).toBe('1. Two Sum.md');
  });

  it('replaces vault/Windows-illegal chars with "-" and trims trailing dots/spaces', () => {
    // Full-width chars are Windows-legal and pass through; the half-width
    // forbidden set does not.
    expect(buildNoteFilename(1, '两数之和：进阶')).toBe('1. 两数之和：进阶.md');
    expect(buildNoteFilename(1, 'a/b\\c:d*e?f"g<h>i|j')).toBe('1. a-b-c-d-e-f-g-h-i-j.md');
    // Windows forbids trailing dots/spaces in names.
    expect(buildNoteFilename(1, '两数之和. ')).toBe('1. 两数之和.md');
  });

  it('strips trailing slashes from folder and joins with /', () => {
    expect(buildNotePath('LeetCode', 1, '两数之和')).toBe('LeetCode/1. 两数之和.md');
    expect(buildNotePath('LeetCode/', 1, '两数之和')).toBe('LeetCode/1. 两数之和.md');
    expect(buildNotePath('LeetCode//', 1, '两数之和')).toBe('LeetCode/1. 两数之和.md');
  });

  it('handles nested folders', () => {
    expect(buildNotePath('Study/LeetCode', 42, '接雨水')).toBe('Study/LeetCode/42. 接雨水.md');
  });
});
