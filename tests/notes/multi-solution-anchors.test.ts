// tests/notes/multi-solution-anchors.test.ts
// Ticket #07 — 多解法锚点测试
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NoteWriter } from '../../src/notes/NoteWriter';
import type { NoteWriterClient, NoteWriterSettings } from '../../src/notes/NoteWriter';
import { makeMockVaultApp } from '../helpers/mock-vault';

describe('Ticket 07: 多解法锚点', () => {
  let mockClient: NoteWriterClient;
  let mockSettings: NoteWriterSettings;
  let noteWriter: NoteWriter;
  let mockApp: ReturnType<typeof makeMockVaultApp>;
  let graphqlMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    graphqlMock = vi.fn();
    mockClient = {
      getProblemDetail: vi.fn(),
      lcCN: {
        graphql: graphqlMock,
      } as unknown as NoteWriterClient['lcCN'],
    };

    mockSettings = {
      getProblemsFolder: () => 'LeetCode',
      getDefaultLanguage: () => 'python3',
      getRegion: () => 'cn' as const,
      getNoteTemplate: () => "",
      getNoteFooter: () => "",
      getProblemDetail: () => null,
      setProblemDetail: vi.fn(),
      getDownloadImages: () => false,
      getImageFolder: () => '附件/leetcode',
      getCustomPlaceholders: () => ({}),
    };

    // Create mock app with initial note content
    const noteContent = `---
lc-slug: two-sum
---

# 两数之和

<!-- lc:problem slug="two-sum" -->
题目内容
<!-- /lc:problem -->

<!-- lc:solution slug="two-sum" source="official" -->

<!-- /lc:solution -->

<!-- lc:solution_approach slug="two-sum" source="official" -->

<!-- /lc:solution_approach -->
`;

    mockApp = makeMockVaultApp({
      'LeetCode/1. Two Sum.md': noteContent,
    });
    noteWriter = new NoteWriter(mockApp.app as never, mockClient, mockSettings);
  });

  describe('refreshSolution', () => {
    it('rejects invalid solution URL', async () => {
      const file = mockApp.app.vault.getAbstractFileByPath('LeetCode/1. Two Sum.md');
      await noteWriter.refreshSolution(file as never, 'two-sum', 'invalid-url');
      // Should show notice about invalid URL
      // (we can't easily test Notice calls, but we can verify it doesn't crash)
    });

    it('handles missing solution gracefully', async () => {
      const file = mockApp.app.vault.getAbstractFileByPath('LeetCode/1. Two Sum.md');
      // Mock graphql to return no solution
      graphqlMock.mockResolvedValue({ data: { question: { solution: null } } });

      await noteWriter.refreshSolution(file as never, 'two-sum');
      // Should show notice about no solution found
    });

    it('rewrites solution anchor with official solution', async () => {
      const file = mockApp.app.vault.getAbstractFileByPath('LeetCode/1. Two Sum.md');

      // Mock graphql to return a solution
      graphqlMock.mockResolvedValue({
        data: {
          question: {
            solution: {
              title: '官方题解',
              content: '<p>解题思路</p><pre><code>def solve():\n    pass</code></pre>',
            },
          },
        },
      });

      await noteWriter.refreshSolution(file as never, 'two-sum');

      // Verify the note was updated
      const updated = mockApp.state.contents.get('LeetCode/1. Two Sum.md');
      expect(updated).toContain('def solve()');
      expect(updated).toContain('解题思路');
    });
  });
});
