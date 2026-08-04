// src/notes/TemplateEngine.ts
// Ticket #5 — template placeholder engine.
// Renders user-configurable note templates with 12 built-in placeholders
// + support for user-defined custom placeholders (Settings).

/** All data available for template rendering. */
export interface TemplateData {
  slug: string;
  id: number;
  title: string;
  title_cn: string;
  difficulty: string;
  tags: string;
  url: string;
  solved_date: string;
  language: string;
  problem: string;
  code: string;
  solution: string;
  solution_approach: string;
}

/** Built-in placeholder → key mapping. Each placeholder maps to a TemplateData field. */
const BUILTIN_PLACEHOLDERS: Record<string, keyof TemplateData> = {
  slug: 'slug',
  title: 'title',
  title_cn: 'title_cn',
  problem: 'problem',
  code: 'code',
  solution: 'solution',
  solution_approach: 'solution_approach',
  difficulty: 'difficulty',
  tags: 'tags',
  id: 'id',
  url: 'url',
  solved_date: 'solved_date',
  language: 'language',
};

/** Default template — matches spec §2.13.
 *  Plugin-owned regions use HTML comments (`<!-- lc:problem -->`) as anchors.
 *  `lc-language` in frontmatter is the single source of truth for code language.
 *  FIXME (region-seam): `lc-region: cn` is hardcoded; when a future .com toggle
 *  lands, this must become `{{region}}` so the rendered note reflects the
 *  actual region. Tracked for ticket 11 (store compliance) / region-seam work. */
export const DEFAULT_TEMPLATE = `---
lc-slug: {{slug}}
lc-url: {{url}}
lc-region: cn
lc-language: {{language}}
difficulty: {{difficulty}}
tags: [leetcode, {{tags}}]
solved_date: {{solved_date}}
---

# {{title_cn}}

> 🔗 [{{title_cn}}]({{url}}) · {{difficulty}} · 题号 {{id}}

<!-- lc:problem -->
{{problem}}
<!-- /lc:problem -->

## 我的代码

<!-- lc:code -->
{{code}}
<!-- /lc:code -->

## 代码思路

（你自己写代码时的思路，插件永不修改）

## 题解

<!-- lc:solution source=url url="" -->
{{solution}}
<!-- /lc:solution -->

## 题解思路

<!-- lc:solution_approach source=url url="" -->
{{solution_approach}}
<!-- /lc:solution_approach -->

## 复盘

（你自己的心得，插件永不修改）
`;

/** Render a template string by replacing {{placeholder}} tokens with values
 *  from the data model. Unknown placeholders are left as-is (no substitution). */
export function renderTemplate(template: string, data: TemplateData): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    const key = BUILTIN_PLACEHOLDERS[name];
    if (key) {
      return String(data[key] ?? '');
    }
    // Unknown placeholder — leave as-is (user-defined or future placeholder).
    return match;
  });
}

/** Build TemplateData from the data available at note creation time.
 *  Caller supplies the problem detail, code snippet, and metadata. */
export function buildTemplateData(input: {
  slug: string;
  id: number;
  title: string;
  /** cn title (translatedTitle from LC). Falls back to English title. */
  title_cn?: string | null;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  url: string;
  language: string;
  /** HTML problem content, already converted to Markdown. */
  problemMarkdown: string;
  /** Starter code or AC-submission code. */
  starterCode: string;
  /** Topic tags as comma-separated names. */
  tagsLabel: string;
}): TemplateData {
  const now = new Date().toISOString().slice(0, 10);
  const difficultyLabel: Record<string, string> = {
    Easy: '简单',
    Medium: '中等',
    Hard: '困难',
  };
  return {
    slug: input.slug,
    id: input.id,
    title: input.title,
    title_cn: input.title_cn || input.title,
    difficulty: difficultyLabel[input.difficulty] ?? input.difficulty,
    tags: input.tagsLabel,
    url: input.url,
    solved_date: now,
    language: input.language,
    problem: input.problemMarkdown.trim(),
    code: input.starterCode.trim() || '// 在此粘贴你的代码',
    solution: '',
    solution_approach: '',
  };
}
