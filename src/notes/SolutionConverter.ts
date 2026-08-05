// src/notes/SolutionConverter.ts
// Ticket #4 — cn 题解 content converter.
// Handles official editorial (Markdown + $$ + iframe) and community 题解.
// Auto-splits into ## 题解 (code) and ## 题解思路 (prose).

import { htmlToMarkdown } from './htmlToMarkdown';

/** Internal helper — check if a string looks like HTML. */
function looksLikeHtml(content: string): boolean {
  return /<\/?\w+[^>]*>/i.test(content) && !content.startsWith('#');
}

/** Normalize `$$x$$` → `$x$` for inline math when on a single line.
 *  Obsidian renders `$$` as display math; inline `$$` is unusual but
 *  cn uses it for inline equations. */
function normalizeInlineMath(content: string): string {
  const result: string[] = [];
  for (const rawLine of content.split('\n')) {
    const trimmed = rawLine.trim();
    // Skip display-math lines — only $$ on the line.
    if (trimmed.startsWith('$$') && trimmed.endsWith('$$')
        && trimmed === `$$${trimmed.slice(2, -2).trim()}$$`) {
      result.push(rawLine);
      continue;
    }
    // On prose lines, convert inline $$x$$ → $x$.
    const line = rawLine.replace(/\$\$(.+?)\$\$/g, (_m: string, inner: string) => {
      if (inner.includes('\n')) return _m;
      return `$${inner}$`;
    });
    result.push(line);
  }
  return result.join('\n');
}

/** Convert a playground iframe to a Markdown link.
 *  Fetching the actual code from the playground shared page requires an extra
 *  network hop — v1 emits a link; v1 stretch fetches the code. */
function convertPlaygroundIframes(content: string): string {
  return content.replace(
    /<iframe[^>]*src="https:\/\/leetcode\.cn\/playground\/([^/]+)\/shared"[^>]*><\/iframe>/g,
    (_m, id: string) => `[查看代码](https://leetcode.cn/playground/${id}/shared/)`,
  );
}

/** Split 题解 content into code blocks + prose sections.
 *  Returns { code: string; approach: string }.
 *  code = fenced code blocks + playground links
 *  approach = everything else (headings, paragraphs, math, lists). */
export function splitSolutionContent(content: string): { code: string; approach: string } {
  const codeParts: string[] = [];
  const proseParts: string[] = [];

  // Split by fenced code blocks — code fences go to 'code', rest to 'approach'.
  const fencePattern = /(```[\s\S]*?```)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(content)) !== null) {
    // Text before this fence → prose
    const before = content.slice(lastIndex, match.index).trim();
    if (before) proseParts.push(before);
    // The fence itself → code
    if (match[1]) codeParts.push(match[1]);
    lastIndex = fencePattern.lastIndex;
  }
  // Remaining text after last fence → prose
  const after = content.slice(lastIndex).trim();
  if (after) proseParts.push(after);

  // Treat playground links as code
  const playgroundPattern = /\[查看代码\]\(https:\/\/leetcode\.cn\/playground\/[^)]+\)/g;
  const proseJoined = proseParts.join('\n\n');
  const playgroundInProse = proseJoined.match(playgroundPattern) ?? [];
  const cleanProse = proseJoined.replace(playgroundPattern, '').trim();

  return {
    code: [...codeParts, ...playgroundInProse].join('\n\n').trim(),
    approach: cleanProse,
  };
}

export interface ConvertedSolution {
  /** Title of the solution article. */
  title: string;
  /** Code blocks + playground links — goes under ## 题解. */
  code: string;
  /** Prose explanation — goes under ## 题解思路. */
  approach: string;
}

/**
 * Convert a raw 题解 content string (from cn official or community) into
 * Obsidian-ready Markdown sections.
 *
 * Pipeline: HTML detection → strip [TOC] → preserve $$ → playground convert
 * → split code/prose.
 */
export function convertSolution(raw: SolutionInput): ConvertedSolution {
  let content = raw.content;

  // Step 1 — strip [TOC]
  content = content.replace(/^\[TOC\]\s*/m, '').trim();

  // Step 2 — if HTML, strip dangerous tags first, convert playground iframes, then convert to Markdown
  if (looksLikeHtml(content)) {
    // Strip script/style before htmlToMarkdown to prevent them from being processed
    content = content.replace(/<script[\s\S]*?<\/script>/gi, '');
    content = content.replace(/<style[\s\S]*?<\/style>/gi, '');
    // Convert playground iframes to links BEFORE htmlToMarkdown (which would strip them)
    content = convertPlaygroundIframes(content);
    content = htmlToMarkdown(content);
  }

  // Step 3 — normalize inline math
  content = normalizeInlineMath(content);

  // Step 4 — remove stray HTML tags
  content = content.replace(/<br\s*\/?>/gi, '\n');
  content = content.replace(/<\/?[bi]>/gi, '**');
  content = content.replace(/<[^>]+>/g, '');

  // Step 5 — split
  const { code, approach } = splitSolutionContent(content);

  return { title: raw.title, code, approach };
}

export interface SolutionInput {
  title: string;
  content: string;
}
