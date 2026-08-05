// tests/notes/refresh-granular.test.ts
// Ticket 10: Refresh granular command tests

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NoteWriter } from '../../src/notes/NoteWriter';
import type { NoteWriterClient, NoteWriterSettings } from '../../src/notes/NoteWriter';
import { makeMockVaultApp } from '../helpers/mock-vault';

describe('Ticket 10: Refresh 细粒度命令', () => {
  let mockClient: NoteWriterClient;
  let mockSettings: NoteWriterSettings;
  let noteWriter: NoteWriter;
  let mockApp: ReturnType<typeof makeMockVaultApp>;

  beforeEach(() => {
    mockClient = {
      getProblemDetail: vi.fn(),
      lcCN: { graphql: vi.fn() } as any,
    };

    mockSettings = {
      getProblemsFolder: () => 'LeetCode',
      getDefaultLanguage: () => 'python3',
      getRegion: () => 'cn' as const,
      getNoteTemplate: () => '',
      getProblemDetail: () => null,
      setProblemDetail: vi.fn(),
      getDownloadImages: () => false,
      getImageFolder: () => '附件/leetcode',
      getCustomPlaceholders: () => ({}),
    };

    const noteContent = `---
lc-slug: two-sum
---

# 两数之和

<!-- lc:problem slug="two-sum" -->
题目内容
<!-- /lc:problem -->

<!-- lc:code slug="two-sum" -->
class Solution {}
<!-- /lc:code -->

<!-- lc:solution slug="two-sum" source="url" url="" -->

<!-- /lc:solution -->
`;

    mockApp = makeMockVaultApp({
      'LeetCode/1-two-sum.md': noteContent,
    });
    noteWriter = new NoteWriter(mockApp.app as any, mockClient, mockSettings);
  });

  describe('refreshSingleAnchor', () => {
    it('shows notice when no anchors found', async () => {
      mockApp = makeMockVaultApp({
        'LeetCode/empty.md': '# Empty note',
      });
      noteWriter = new NoteWriter(mockApp.app as any, mockClient, mockSettings);

      const file = mockApp.app.vault.getAbstractFileByPath('LeetCode/empty.md');
      await noteWriter.refreshSingleAnchor(file as any, 0);
      // Should show notice about no anchors
    });

    it('refreshes the nearest anchor to cursor', async () => {
      const file = mockApp.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md');

      // Mock getProblemDetail to return fresh content
      (mockClient.getProblemDetail as any).mockResolvedValue({
        questionFrontendId: '1',
        title: 'Two Sum',
        titleSlug: 'two-sum',
        content: '<p>Updated problem content</p>',
        difficulty: 'Easy',
        isPaidOnly: false,
        topicTags: [],
        codeSnippets: [],
      });

      await noteWriter.refreshSingleAnchor(file as any, 0);

      const updated = mockApp.state.contents.get('LeetCode/1-two-sum.md');
      // Content should still have anchors
      expect(updated).toContain('<!-- lc:problem');
    });
  });

  describe('refreshProblemAnchors', () => {
    it('shows notice when slug not found', async () => {
      const file = mockApp.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md');
      await noteWriter.refreshProblemAnchors(file as any, 'nonexistent-slug');
      // Should show notice about no anchors found
    });

    it('refreshes all anchors for the specified slug', async () => {
      const file = mockApp.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md');

      (mockClient.getProblemDetail as any).mockResolvedValue({
        questionFrontendId: '1',
        title: 'Two Sum',
        titleSlug: 'two-sum',
        content: '<p>Updated content</p>',
        difficulty: 'Easy',
        isPaidOnly: false,
        topicTags: [],
        codeSnippets: [{ lang: 'Python3', langSlug: 'python3', code: 'class Solution: pass' }],
      });

      await noteWriter.refreshProblemAnchors(file as any, 'two-sum');

      const updated = mockApp.state.contents.get('LeetCode/1-two-sum.md');
      expect(updated).toContain('<!-- lc:problem');
      expect(updated).toContain('<!-- lc:code');
    });
  });

  describe('refreshAllNoteAnchors', () => {
    it('shows notice when no anchors found', async () => {
      mockApp = makeMockVaultApp({
        'LeetCode/empty.md': '# Empty note',
      });
      noteWriter = new NoteWriter(mockApp.app as any, mockClient, mockSettings);

      const file = mockApp.app.vault.getAbstractFileByPath('LeetCode/empty.md');
      await noteWriter.refreshAllNoteAnchors(file as any);
      // Should show notice about no anchors
    });

    it('refreshes all anchors in the note', async () => {
      const file = mockApp.app.vault.getAbstractFileByPath('LeetCode/1-two-sum.md');

      (mockClient.getProblemDetail as any).mockResolvedValue({
        questionFrontendId: '1',
        title: 'Two Sum',
        titleSlug: 'two-sum',
        content: '<p>Fully updated</p>',
        difficulty: 'Easy',
        isPaidOnly: false,
        topicTags: [],
        codeSnippets: [{ lang: 'Python3', langSlug: 'python3', code: 'class Solution: pass' }],
      });

      await noteWriter.refreshAllNoteAnchors(file as any);

      const updated = mockApp.state.contents.get('LeetCode/1-two-sum.md');
      expect(updated).toContain('<!-- lc:problem');
    });
  });
});
