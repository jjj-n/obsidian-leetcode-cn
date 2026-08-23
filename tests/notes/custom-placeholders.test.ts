// tests/notes/custom-placeholders.test.ts
// Ticket #03 — custom placeholder rendering.
import { describe, it, expect } from 'vitest';
import { renderTemplate, type TemplateData } from '../../src/notes/TemplateEngine';

const data: TemplateData = {
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
  problem: '## Problem\ncontent',
  code: 'class Solution {}',
  solution: '',
  solution_approach: '',
};

describe('renderTemplate with custom placeholders', () => {
  it('replaces custom placeholder that references no built-in', () => {
    const result = renderTemplate('{{my_field}}', data, { my_field: 'hello' });
    expect(result).toBe('hello');
  });

  it('replaces custom placeholder that references a built-in', () => {
    const result = renderTemplate('Before {{my_id}} after', data, {
      my_id: 'lc-{{id}}',
    });
    expect(result).toBe('Before lc-1 after');
  });

  it('replaces custom placeholder with multiple built-in refs', () => {
    const result = renderTemplate('{{my_tag}}', data, {
      my_tag: '{{title_cn}} ({{difficulty}})',
    });
    expect(result).toBe('两数之和 (简单)');
  });

  it('leaves custom placeholder cross-refs as-is (no recursion)', () => {
    const result = renderTemplate('{{a}}', data, {
      a: '{{b}}',
      b: 'nested',
    });
    expect(result).toBe('{{b}}');
  });

  it('built-in takes precedence over custom with same name', () => {
    // Spec: custom and built-in coexist without conflict; built-in wins.
    const result = renderTemplate('{{title_cn}}', data, { title_cn: '自定义标题' });
    expect(result).toBe('两数之和');
  });

  it('works with empty customPlaceholders', () => {
    const result = renderTemplate('{{title_cn}}', data, {});
    expect(result).toBe('两数之和');
  });

  it('leaves unknown placeholders as-is even with custom map', () => {
    const result = renderTemplate('{{unknown}}', data, { other: 'x' });
    expect(result).toBe('{{unknown}}');
  });
});
