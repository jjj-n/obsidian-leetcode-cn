// src/notes/AnchorRewriter.ts
// Ticket 06 & 08: Rewrite content within anchor regions in a note body.

import { parseAnchors, replaceAnchorContent, type AnchorRegion } from './AnchorParser';

/**
 * Rewrite the content of a single anchor region identified by type + params.
 * Returns the updated body, or null if no matching anchor found.
 */
export function rewriteAnchorByParams(
  body: string,
  type: string,
  matchParams: Record<string, string>,
  newContent: string
): string | null {
  const anchors = parseAnchors(body);

  // Find anchor matching type and all specified params
  const target = anchors.find(a => {
    if (a.type !== type) return false;
    for (const [key, value] of Object.entries(matchParams)) {
      if ((a.params as Record<string, string>)[key] !== value) return false;
    }
    return true;
  });

  if (!target) return null;
  return replaceAnchorContent(body, target, newContent);
}

/**
 * Rewrite all anchors of a given type for a specific slug.
 * Returns the updated body.
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
