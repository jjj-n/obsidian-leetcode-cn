// src/notes/AnchorRewriter.ts
// Ticket 06 & 08: Rewrite content within anchor regions in a note body.

import { parseAnchors, replaceAnchorContent, type AnchorRegion } from './AnchorParser';

/**
 * Rewrite the content of a single anchor region identified by type + params.
 * Returns the updated body, or null if no matching anchor found.
 * Throws an error if multiple anchors match (ambiguous match).
 */
export function rewriteAnchorByParams(
  body: string,
  type: string,
  matchParams: Record<string, string>,
  newContent: string
): string | null {
  const anchors = parseAnchors(body);

  // Find ALL anchors matching type and all specified params
  const matches = anchors.filter(a => {
    if (a.type !== type) return false;
    for (const [key, value] of Object.entries(matchParams)) {
      if ((a.params as Record<string, string>)[key] !== value) return false;
    }
    return true;
  });

  // No match found
  if (matches.length === 0) return null;

  // Ambiguous match - multiple anchors match the criteria
  // This indicates the caller should provide more specific params (e.g., url or index)
  if (matches.length > 1) {
    const paramStr = Object.entries(matchParams)
      .map(([k, v]) => `${k}="${v}"`)
      .join(' ');
    throw new Error(
      `Ambiguous match: ${matches.length} anchors of type "${type}" match params {${paramStr}}. ` +
      `Provide more specific params (e.g., url or index) to uniquely identify the target anchor.`
    );
  }

  // Unique match found
  const target = matches[0];
  if (!target) return null;
  return replaceAnchorContent(body, target, newContent);
}

/**
 * Rewrite all anchors of a given type for a specific slug.
 * Returns the updated body.
 *
 * TODO: 当前设计有问题 - 会把所有匹配锚点更新为相同内容。
 * 对于多解法场景（同一题多个 solution 锚点，不同 source/url/index），
 * 应该分别获取每个锚点对应的内容，而不是批量替换。
 * Ticket 10 实现"刷新单题全部"时需要重新设计此函数，
 * 改为接受 Map<params, content> 或类似结构，逐个精确更新。
 */
export function rewriteAnchorsForSlug(
  body: string,
  slug: string,
  type: string,
  newContent: string
): string {
  const anchors = parseAnchors(body);
  let result = body;

  // Find all anchors of this type with this slug
  const targets = anchors.filter(
    a => a.type === type && a.params.slug === slug
  );

  // Rewrite from end to start to preserve offsets
  for (let i = targets.length - 1; i >= 0; i--) {
    const target = targets[i];
    if (!target) continue;
    result = replaceAnchorContent(result, target, newContent);
  }

  return result;
}

/**
 * Rewrite all anchors in a note (for full refresh).
 * Returns the updated body.
 *
 * TODO: 当前设计有问题 - 会把所有匹配锚点更新为相同内容。
 * 对于多解法/多题场景，应该分别获取每个锚点对应的内容。
 * Ticket 10 实现"刷新整篇笔记"时需要重新设计此函数，
 * 改为根据每个锚点的完整参数（slug + source + url/index）分别获取内容。
 */
export function rewriteAllAnchors(
  body: string,
  type: string,
  newContent: string
): string {
  const anchors = parseAnchors(body);
  let result = body;

  const targets = anchors.filter(a => a.type === type);

  // Rewrite from end to start to preserve offsets
  for (let i = targets.length - 1; i >= 0; i--) {
    const target = targets[i];
    if (!target) continue;
    result = replaceAnchorContent(result, target, newContent);
  }

  return result;
}

/**
 * Append a new anchor region at the end of a note (or after the last anchor of a given type).
 */
export function appendAnchorRegion(
  body: string,
  type: string,
  params: Record<string, string>,
  content: string,
  heading?: string
): string {
  const paramParts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    paramParts.push(`${key}="${value}"`);
  }
  const paramString = paramParts.length > 0 ? ' ' + paramParts.join(' ') : '';

  const open = `<!-- lc:${type}${paramString} -->`;
  const close = `<!-- /lc:${type} -->`;
  const region = `\n${open}\n${content.trim()}\n${close}\n`;

  if (heading) {
    return body + `\n${heading}\n${region}`;
  }
  return body + region;
}
