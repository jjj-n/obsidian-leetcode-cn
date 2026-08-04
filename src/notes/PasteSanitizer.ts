// src/notes/PasteSanitizer.ts
// Ticket #04 — standalone paste-sanitize command.
// Strips dangerous/irrelevant tags and normalizes math for Obsidian rendering.
import { htmlToMarkdown } from './htmlToMarkdown';

/** Sanitize pasted HTML into Obsidian-compatible Markdown. */
export function pasteSanitize(html: string): string {
  let cleaned = html.slice();

  // Strip dangerous tags.
  cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, '');
  cleaned = cleaned.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

  // Convert playground iframes to links (mirrors SolutionConverter.ts:39-40).
  cleaned = cleaned.replace(
    /<iframe[^>]*src="https:\/\/leetcode\.cn\/playground\/([^/]+)\/shared"[^>]*><\/iframe>/g,
    (_m, id: string) => `[查看代码](https://leetcode.cn/playground/${id}/shared/)`,
  );
  // Strip remaining iframes.
  cleaned = cleaned.replace(/<iframe[^>]*>\s*<\/iframe>/gi, '');

  // Strip event handlers.
  cleaned = cleaned.replace(/\s+on\w+\s*=\s*"[^"]*"/gi, '');
  cleaned = cleaned.replace(/\s+on\w+\s*=\s*'[^']*'/gi, '');

  // Normalize MathJax / HTML math to Obsidian $/$ or $$/$$.
  cleaned = cleaned.replace(/<span\s+class\s*=\s*["']math["'][^>]*>([\s\S]*?)<\/span>/gi, '$$$1$');
  cleaned = cleaned.replace(/\\\(\s*/g, '$');
  cleaned = cleaned.replace(/\s*\\\)/g, '$');
  cleaned = cleaned.replace(/\\\[\s*/g, '$$');
  cleaned = cleaned.replace(/\s*\\\]/g, '$$');

  // Convert to Markdown via existing turndown pipeline.
  return htmlToMarkdown(cleaned);
}
