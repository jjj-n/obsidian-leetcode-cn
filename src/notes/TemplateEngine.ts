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
  /** Chinese difficulty label (简单/中等/困难). */
  difficulty: string;
  /** English topic names, comma-joined (e.g. "Array, Hash Table"). */
  tags: string;
  /** Chinese topic names, 、-joined (e.g. 数组、哈希表) — fills 分类. */
  tags_cn: string;
  url: string;
  solved_date: string;
  language: string;
  problem: string;
  code: string;
  solution: string;
  solution_approach: string;
}

/** Set of built-in placeholder names — used by SettingsTab for duplicate detection. */
export const BUILTIN_NAMES: ReadonlySet<string> = new Set([
  'slug', 'title', 'title_cn', 'problem', 'code', 'solution',
  'solution_approach', 'difficulty', 'tags', 'tags_cn', 'id', 'url',
  'solved_date', 'language',
]);

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
  tags_cn: 'tags_cn',
  id: 'id',
  url: 'url',
  solved_date: 'solved_date',
  language: 'language',
};

/** Default template — mirrors the user's hand-tuned Templater template
 *  (vault: 01丨Templates/LeetCode Template(Java).md) so plugin-generated notes
 *  drop straight into their existing workflow:
 *    - frontmatter uses their Chinese property vocabulary (created/分类/难度/
 *      分数/情况/时间复杂度/空间复杂度/备注) with 分类 and 难度 auto-filled
 *    - plugin-owned internals (lc-slug/lc-language/lc-status) sit at the end
 *    - a `链接：` line under frontmatter instead of a metadata blockquote
 *    - NO H1 (Obsidian's inline title already shows the note name) and NO
 *      embedded review table — per-note extras live in the user-configurable
 *      尾部附加内容 (noteFooter) setting instead of being hardcoded here.
 *  Plugin-owned regions use HTML comments (`<!-- lc:problem -->`) as anchors.
 *  `lc-language` in frontmatter is the single source of truth for code language. */
export const DEFAULT_TEMPLATE = [
  '---',
  'created: {{solved_date}}',
  '分类: {{tags_cn}}',
  '难度: {{difficulty}}',
  '分数:',
  '情况:',
  '时间复杂度:',
  '空间复杂度:',
  '备注:',
  'tags:',
  '  - leetcode',
  '  - {{language}}',
  'lc-slug: {{slug}}',
  'lc-language: {{language}}',
  'lc-status: untouched',
  '---',
  '',
  '链接：[力扣 (LeetCode)]({{url}})',
  '',
  '## 题面',
  '',
  '<!-- lc:problem slug="{{slug}}" -->',
  '{{problem}}',
  '<!-- /lc:problem -->',
  '',
  '## 代码',
  '',
  '<!-- lc:code slug="{{slug}}" -->',
  '{{code}}',
  '<!-- /lc:code -->',
  '',
  '## 代码思路',
  '',
  '（你自己写代码时的思路，插件永不修改）',
  '',
  '## 题解',
  '',
  '<!-- lc:solution slug="{{slug}}" source=url url="" -->',
  '{{solution}}',
  '<!-- /lc:solution -->',
  '',
  '## 题解思路',
  '',
  '<!-- lc:solution_approach slug="{{slug}}" source=url url="" -->',
  '{{solution_approach}}',
  '<!-- /lc:solution_approach -->',
  '',
  '## 遇到的错误',
  '',
  '（做题时踩过的坑，插件永不修改）',
  '',
].join('\n');

/** Render a template string by replacing {{placeholder}} tokens with values
 *  from the data model plus any user-defined custom placeholders.
 *  Unknown placeholders are left as-is (no substitution). */
export function renderTemplate(
  template: string,
  data: TemplateData,
  customPlaceholders?: Record<string, string>,
): string {
  // Pre-resolve custom placeholder values by replacing built-in refs inside them.
  // Custom placeholders CAN reference built-in but NOT other custom (no recursion).
  const resolvedCustom = new Map<string, string>();
  if (customPlaceholders) {
    for (const [name, valueTemplate] of Object.entries(customPlaceholders)) {
      const resolved = valueTemplate.replace(/\{\{(\w+)\}\}/g, (_m, ref: string) => {
        // Only allow built-in references — cross-custom refs stay as-is.
        const key = BUILTIN_PLACEHOLDERS[ref];
        return key ? String(data[key] ?? '') : _m;
      });
      resolvedCustom.set(name, resolved);
    }
  }

  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    // Built-in takes precedence; custom only fires for non-built-in names
    // so they coexist without conflict (spec: "共存、不冲突").
    const key = BUILTIN_PLACEHOLDERS[name];
    if (key) {
      return String(data[key] ?? '');
    }
    if (resolvedCustom.has(name)) {
      return resolvedCustom.get(name)!;
    }
    // Unknown placeholder — leave as-is.
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
  /** Topic tags as comma-separated English names. */
  tagsLabel: string;
  /** Topic tags as 、-joined Chinese names (分类 property). Empty/omitted when
   *  the API returned no tags — 分类 stays blank for the user to fill. */
  tagsCnLabel?: string;
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
    tags_cn: input.tagsCnLabel ?? '',
    url: input.url,
    solved_date: now,
    language: input.language,
    problem: input.problemMarkdown.trim(),
    code: input.starterCode.trim() || '// 在此粘贴你的代码',
    solution: '',
    solution_approach: '',
  };
}
