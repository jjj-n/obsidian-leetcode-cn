// tests/notes/template-engine.test.ts
// Ticket #5: template engine tests.
import { describe, it, expect } from 'vitest';
import {
  renderTemplate,
  buildTemplateData,
  DEFAULT_TEMPLATE,
} from '../../src/notes/TemplateEngine';
import type { TemplateData } from '../../src/notes/TemplateEngine';

const sampleData: TemplateData = {
  slug: 'two-sum',
  id: 1,
  title: 'Two Sum',
  title_cn: '两数之和',
  difficulty: '简单',
  tags: '数组, 哈希表',
  tags_cn: '数组、哈希表',
  url: 'https://leetcode.cn/problems/two-sum/',
  solved_date: '2026-08-04',
  language: 'python3',
  problem: '## 问题描述\n\n给定一个整数数组...',
  code: 'class Solution:\n    def twoSum(self, nums, target):\n        pass',
  solution: '',
  solution_approach: '',
};

describe('renderTemplate', () => {
  it('replaces all built-in placeholders', () => {
    const result = renderTemplate('{{title_cn}} ({{id}})', sampleData);
    expect(result).toBe('两数之和 (1)');
  });

  it('replaces code placeholder with content', () => {
    const result = renderTemplate('{{code}}', sampleData);
    expect(result).toContain('class Solution:');
  });

  it('leaves unknown placeholders as-is', () => {
    const result = renderTemplate('{{custom_field}}', sampleData);
    expect(result).toBe('{{custom_field}}');
  });

  it('handles empty template', () => {
    expect(renderTemplate('', sampleData)).toBe('');
  });

  it('handles template with no placeholders', () => {
    expect(renderTemplate('plain text', sampleData)).toBe('plain text');
  });

  it('handles missing data gracefully (empty string)', () => {
    const empty: TemplateData = { ...sampleData, title_cn: '' };
    expect(renderTemplate('{{title_cn}}', empty)).toBe('');
  });
});

describe('buildTemplateData', () => {
  it('builds from minimal input', () => {
    const data = buildTemplateData({
      slug: 'two-sum',
      id: 1,
      title: 'Two Sum',
      title_cn: '两数之和',
      difficulty: 'Easy',
      url: 'https://leetcode.cn/problems/two-sum/',
      language: 'java',
      problemMarkdown: '## Problem\n\ncontent',
      starterCode: 'class Solution {}',
      tagsLabel: 'array, hash-table',
      tagsCnLabel: '数组、哈希表',
    });
    expect(data.slug).toBe('two-sum');
    expect(data.title_cn).toBe('两数之和');
    expect(data.difficulty).toBe('简单');
    expect(data.tags).toBe('array, hash-table');
    expect(data.tags_cn).toBe('数组、哈希表');
    expect(data.code).toBe('class Solution {}');
    expect(data.problem).toBe('## Problem\n\ncontent');
    expect(data.solved_date).toBeTruthy();
  });

  it('defaults tags_cn to empty string when tagsCnLabel is omitted', () => {
    const data = buildTemplateData({
      slug: 'two-sum',
      id: 1,
      title: 'Two Sum',
      title_cn: null,
      difficulty: 'Easy',
      url: 'https://leetcode.cn/problems/two-sum/',
      language: 'python3',
      problemMarkdown: 'content',
      starterCode: '',
      tagsLabel: '',
    });
    expect(data.tags_cn).toBe('');
  });

  it('falls back to English title when title_cn is empty', () => {
    const data = buildTemplateData({
      slug: 'two-sum',
      id: 1,
      title: 'Two Sum',
      title_cn: null,
      difficulty: 'Easy',
      url: 'https://leetcode.cn/problems/two-sum/',
      language: 'python3',
      problemMarkdown: 'content',
      starterCode: '',
      tagsLabel: '',
    });
    expect(data.title_cn).toBe('Two Sum');
  });

  it('provides default value for empty starter code', () => {
    const data = buildTemplateData({
      slug: 'two-sum', id: 1, title: 'Two Sum', title_cn: null,
      difficulty: 'Easy', url: 'https://leetcode.cn/problems/two-sum/',
      language: 'python3', problemMarkdown: 'x', starterCode: '', tagsLabel: '',
    });
    expect(data.code).toBe('// 在此粘贴你的代码');
  });
});

describe('DEFAULT_TEMPLATE', () => {
  it('renders with sample data without errors', () => {
    const result = renderTemplate(DEFAULT_TEMPLATE, sampleData);
    // Check key sections are present after rendering
    expect(result).toContain('lc-slug: two-sum');
    expect(result).toContain('lc-language: python3');
    expect(result).toContain('难度: 简单');
    expect(result).toContain('# 1. 两数之和');
    expect(result).toContain('链接：[1. 两数之和 - 力扣 (LeetCode)](https://leetcode.cn/problems/two-sum/)');
    // Anchors now include slug parameters
    expect(result).toContain('<!-- lc:problem slug="two-sum" -->');
    expect(result).toContain('<!-- /lc:problem -->');
    expect(result).toContain('## 代码');
    expect(result).toContain('<!-- lc:code slug="two-sum" -->');
    expect(result).toContain('<!-- /lc:code -->');
    expect(result).toContain('## 代码思路');
    expect(result).toContain('## 题解');
    expect(result).toContain('## 题解思路');
    expect(result).toContain('## 遇到的错误');
    expect(result).toContain('## 最近刷题回顾');
    expect(result).toContain('from #python3 and #leetcode and !"01丨Templates"');
  });

  it('frontmatter carries the user template vocabulary, not retired keys', () => {
    const result = renderTemplate(DEFAULT_TEMPLATE, sampleData);
    expect(result).toContain('created: 2026-08-04');
    expect(result).toContain('分类: 数组、哈希表');
    for (const retired of ['lc-url', 'lc-id', 'lc-title', 'lc-difficulty', 'lc-region', 'solved_date:', 'aliases']) {
      expect(result).not.toContain(retired);
    }
  });

  it('contains no unresolved placeholders after render', () => {
    const result = renderTemplate(DEFAULT_TEMPLATE, sampleData);
    expect(result).not.toMatch(/\{\{\w+\}\}/);
  });
});
