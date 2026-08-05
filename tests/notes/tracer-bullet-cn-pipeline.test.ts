// tests/notes/tracer-bullet-cn-pipeline.test.ts
// Ticket 01 — end-to-end golden test for the cn note pipeline.
//
// Walks the FULL data path that production runs on every new cn note:
//   fetchCNProblemDetail (stubbed) → toDetailCacheEntry → htmlToMarkdown →
//   buildTemplateData → renderTemplate(DEFAULT_TEMPLATE, …) → assert on note body.
//
// Verifies the tracer-bullet contract: given a real cn problem fixture, the
// pipeline produces a note with
//   - Chinese H1 title (from translatedTitle)
//   - complete frontmatter (lc-slug, lc-url with leetcode.cn, lc-region, lc-language,
//     difficulty in Chinese, tags, solved_date)
//   - both plugin-owned anchors (`<!-- lc:problem -->`, `<!-- lc:code -->`) closed
//   - problem HTML converted to Obsidian-compatible Markdown (examples, sup, code)
//   - no unresolved placeholders left after render
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fetchCNProblemDetail } from '../../src/api/LeetCodeCNAdapter';
import { toDetailCacheEntry } from '../../src/notes/NoteWriter';
import type { NoteWriterDetail } from '../../src/notes/NoteWriter';
import { htmlToMarkdown } from '../../src/notes/htmlToMarkdown';
import { buildTemplateData, renderTemplate, DEFAULT_TEMPLATE } from '../../src/notes/TemplateEngine';

const FIXTURE_HTML = readFileSync(
  resolve(__dirname, '../fixtures/lc-two-sum.html'),
  'utf-8',
);

/** Stub leetcode.cn GraphQL response for two-sum, mirroring real cn response shape. */
function makeCNTwoSumResponse(): {
  data: {
    question: {
      questionFrontendId: string;
      questionId: string;
      title: string;
      titleSlug: string;
      content: string;
      translatedTitle: string | null;
      translatedContent: string;
      difficulty: 'Easy';
      isPaidOnly: false;
      exampleTestcases: string;
      topicTags: Array<{ name: string; slug: string }>;
      codeSnippets: Array<{ lang: string; langSlug: string; code: string }>;
    };
  };
} {
  return {
    data: {
      question: {
        questionFrontendId: '1',
        questionId: '1',
        title: 'Two Sum',
        titleSlug: 'two-sum',
        content: FIXTURE_HTML,
        translatedTitle: '两数之和',
        translatedContent: FIXTURE_HTML, // cn returns the same HTML shape with Chinese copy in production; fixture stands in
        difficulty: 'Easy',
        isPaidOnly: false,
        exampleTestcases: '[2,7,11,15]\n9',
        topicTags: [
          { name: '数组', slug: 'array' },
          { name: '哈希表', slug: 'hash-table' },
        ],
        codeSnippets: [
          { lang: 'Python3', langSlug: 'python3', code: 'class Solution:\n    def twoSum(self, nums: list[int], target: int) -> list[int]:' },
          { lang: 'Java', langSlug: 'java', code: 'class Solution {\n    public int[] twoSum(int[] nums, int target) {' },
        ],
      },
    },
  };
}

describe('tracer-bullet: cn problem → rendered note (data pipeline)', () => {
  // Scope note: this test walks the data pipeline end-to-end
  // (adapter → cache → htmlToMarkdown → template render). Full NoteWriter
  // integration (vault write, processFrontMatter, offline fallback, leaf
  // reveal) is covered separately by tests/note-writer-*.test.ts and
  // tests/offline-regenerate.test.ts. The tracer-bullet contract here is
  // that the cn data produces a fully-formed, anchor-closed, localized
  // note body ready for vault create.
  it('produces a complete, anchor-closed, cn-localized note from a cn fixture', async () => {
    // 1. Adapter layer — fetchCNProblemDetail (pure, no network with stub).
    const lcStub = { graphql: async () => makeCNTwoSumResponse() };
    const detail = await fetchCNProblemDetail(lcStub as never, 'two-sum');
    expect(detail).not.toBeNull();
    expect(detail!.translatedTitle).toBe('两数之和');
    expect(detail!.content).toBe(FIXTURE_HTML);

    // 2. Cache layer — toDetailCacheEntry propagates translatedTitle → titleCn.
    const entry = toDetailCacheEntry(detail as NoteWriterDetail, 'cn');
    expect(entry.titleCn).toBe('两数之和');
    expect(entry.url).toBe('https://leetcode.cn/problems/two-sum/');
    expect(entry.difficulty).toBe('Easy');

    // 3. Rendering layer — HTML → Markdown.
    const problemMarkdown = htmlToMarkdown(entry.contentHtml);
    expect(problemMarkdown).toContain('nums');
    // sup tag → Unicode superscript (htmlToMarkdown's canonical transform).
    expect(problemMarkdown).toMatch(/10[⁴4]/);

    // 4. Template data layer — difficulty Chinese, title_cn from translatedTitle.
    const tagNames = (entry.topicTags ?? []).map((t) => t.name).join(', ');
    const templateData = buildTemplateData({
      slug: 'two-sum',
      id: entry.id,
      title: entry.title,
      title_cn: entry.titleCn ?? entry.title,
      difficulty: entry.difficulty,
      url: entry.url,
      language: 'python3',
      problemMarkdown,
      starterCode: entry.codeSnippets?.find((s) => s.langSlug === 'python3')?.code ?? '',
      tagsLabel: tagNames,
    });
    expect(templateData.title_cn).toBe('两数之和');
    expect(templateData.difficulty).toBe('简单');
    expect(templateData.tags).toBe('数组, 哈希表');

    // 5. Template render — final note body.
    const body = renderTemplate(DEFAULT_TEMPLATE, templateData);

    // (a) Chinese H1 title, not English.
    expect(body).toMatch(/^# 两数之和$/m);
    expect(body).not.toMatch(/^# Two Sum$/m);

    // (b) Frontmatter is complete and cn-localized.
    expect(body).toMatch(/^lc-slug: two-sum$/m);
    expect(body).toMatch(/^lc-url: https:\/\/leetcode\.cn\/problems\/two-sum\/$/m);
    expect(body).toMatch(/^lc-region: cn$/m);
    expect(body).toMatch(/^lc-language: python3$/m);
    expect(body).toMatch(/^difficulty: 简单$/m);
    expect(body).toMatch(/^tags: \[leetcode, 数组, 哈希表\]$/m);
    expect(body).toMatch(/^solved_date: \d{4}-\d{2}-\d{2}$/m);

    // (c) Plugin-owned anchors properly opened AND closed (with slug parameters).
    expect(body).toContain('<!-- lc:problem slug="two-sum" -->');
    expect(body).toContain('<!-- /lc:problem -->');
    expect(body).toContain('<!-- lc:code slug="two-sum" -->');
    expect(body).toContain('<!-- /lc:code -->');
    expect(body).toContain('<!-- lc:solution slug="two-sum" source=url url="" -->');
    expect(body).toContain('<!-- /lc:solution -->');
    expect(body).toContain('<!-- lc:solution_approach slug="two-sum" source=url url="" -->');
    expect(body).toContain('<!-- /lc:solution_approach -->');

    // (d) Anchor bodies carry the expected content.
    const problemRegion = body.match(/<!-- lc:problem slug="two-sum" -->\n([\s\S]*?)\n<!-- \/lc:problem -->/);
    expect(problemRegion).not.toBeNull();
    expect(problemRegion![1]).toContain('nums');
    expect(problemRegion![1]).toContain('target');
    // Example block preserved through htmlToMarkdown's lc-example-block rule.
    expect(problemRegion![1]).toMatch(/Example 1/i);
    expect(problemRegion![1]).toContain('[2,7,11,15]');

    const codeRegion = body.match(/<!-- lc:code slug="two-sum" -->\n([\s\S]*?)\n<!-- \/lc:code -->/);
    expect(codeRegion).not.toBeNull();
    expect(codeRegion![1]).toContain('class Solution:');
    expect(codeRegion![1]).toContain('def twoSum');

    // (e) User-owned sections preserved as-is.
    expect(body).toContain('## 代码思路');
    expect(body).toContain('（你自己写代码时的思路，插件永不修改）');
    expect(body).toContain('## 复盘');
    expect(body).toContain('（你自己的心得，插件永不修改）');

    // (f) No unresolved placeholders leak into the final body.
    expect(body).not.toMatch(/\{\{\w+\}\}/);
  });

  it('falls back to English title when cn translatedTitle is missing', async () => {
    const resp = makeCNTwoSumResponse();
    resp.data.question.translatedTitle = null;
    const lcStub = { graphql: async () => resp };
    const detail = await fetchCNProblemDetail(lcStub as never, 'two-sum');
    const entry = toDetailCacheEntry(detail as NoteWriterDetail, 'cn');
    // titleCn not set when translatedTitle is null.
    expect(entry.titleCn).toBeUndefined();
    // Caller falls back to English title for title_cn.
    const templateData = buildTemplateData({
      slug: 'two-sum', id: entry.id, title: entry.title,
      title_cn: entry.titleCn ?? entry.title,
      difficulty: entry.difficulty, url: entry.url, language: 'python3',
      problemMarkdown: '', starterCode: '', tagsLabel: '',
    });
    expect(templateData.title_cn).toBe('Two Sum');
  });
});
