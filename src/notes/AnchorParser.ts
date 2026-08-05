// src/notes/AnchorParser.ts
// Ticket 06 & 08: Parse and manipulate lc:TYPE anchors with parameters
// Anchor format: <!-- lc:TYPE slug=X source=Y url=Z index=N -->

export interface AnchorParams {
  slug?: string;
  source?: string;
  url?: string;
  index?: string;
}

export interface AnchorRegion {
  type: string;
  params: AnchorParams;
  startOffset: number;
  endOffset: number;
  contentStart: number;
  contentEnd: number;
}

/**
 * Parse all anchors from a note body
 */
export function parseAnchors(body: string): AnchorRegion[] {
  const anchors: AnchorRegion[] = [];
  const openPattern = /<!--\s*lc:(\w+)([^>]*?)-->/g;
  const closePattern = /<!--\s*\/lc:(\w+)\s*-->/g;

  let openMatch;
  while ((openMatch = openPattern.exec(body)) !== null) {
    const type = openMatch[1] || '';
    const paramString = openMatch[2]?.trim() || '';
    const params = parseParams(paramString);
    const startOffset = openMatch.index;
    const contentStart = openMatch.index + openMatch[0].length;

    // Find matching close tag
    const closeRegex = new RegExp(`<!--\\s*\\/lc:${type}\\s*-->`, 'g');
    closeRegex.lastIndex = contentStart;
    const closeMatch = closeRegex.exec(body);

    if (closeMatch) {
      const endOffset = closeMatch.index + closeMatch[0].length;
      const contentEnd = closeMatch.index;

      anchors.push({
        type,
        params,
        startOffset,
        endOffset,
        contentStart,
        contentEnd,
      });
    }
  }

  return anchors;
}

/**
 * Valid source values for solution anchors
 */
export const VALID_SOURCES = ['url', 'ac', 'official', 'starter'] as const;
export type ValidSource = typeof VALID_SOURCES[number];

/**
 * Parse parameter string into AnchorParams object.
 * Supports both quoted (slug="two-sum") and unquoted (slug=two-sum) values.
 * Validates source parameter against allowed values.
 */
function parseParams(paramString: string): AnchorParams {
  const params: AnchorParams = {};
  // Support both quoted and unquoted values: key="value" or key=value
  const paramPattern = /(\w+)=(?:"([^"]*)"|([^\s]+))/g;
  let match;
  while ((match = paramPattern.exec(paramString)) !== null) {
    const key = match[1];
    // Use quoted value (group 2) if present, otherwise unquoted (group 3)
    const value = match[2] !== undefined ? match[2] : match[3] || '';

    if (key === 'slug') {
      params.slug = value;
    } else if (key === 'source') {
      // Validate source against allowed values
      if (VALID_SOURCES.includes(value as ValidSource)) {
        params.source = value;
      }
      // Invalid source values are silently ignored
    } else if (key === 'url') {
      params.url = value;
    } else if (key === 'index') {
      params.index = value;
    }
  }
  return params;
}

/**
 * Find anchors matching a specific slug
 */
export function findAnchorsBySlug(body: string, slug: string): AnchorRegion[] {
  return parseAnchors(body).filter(a => a.params.slug === slug);
}

/**
 * Find anchors matching a specific type
 */
export function findAnchorsByType(body: string, type: string): AnchorRegion[] {
  return parseAnchors(body).filter(a => a.type === type);
}

/**
 * Build anchor opening comment with parameters
 */
export function buildAnchorOpen(type: string, params: AnchorParams = {}): string {
  const paramParts: string[] = [];
  if (params.slug) paramParts.push(`slug="${params.slug}"`);
  if (params.source) paramParts.push(`source="${params.source}"`);
  if (params.url) paramParts.push(`url="${params.url}"`);
  if (params.index) paramParts.push(`index="${params.index}"`);

  const paramString = paramParts.length > 0 ? ' ' + paramParts.join(' ') : '';
  return `<!-- lc:${type}${paramString} -->`;
}

/**
 * Build anchor closing comment
 */
export function buildAnchorClose(type: string): string {
  return `<!-- /lc:${type} -->`;
}

/**
 * Replace content within an anchor region
 */
export function replaceAnchorContent(
  body: string,
  anchor: AnchorRegion,
  newContent: string
): string {
  return (
    body.slice(0, anchor.contentStart) +
    '\n' + newContent.trim() + '\n' +
    body.slice(anchor.contentEnd)
  );
}

/**
 * Extract all unique slugs from anchors in a note
 */
export function extractSlugs(body: string): string[] {
  const anchors = parseAnchors(body);
  const slugSet = new Set<string>();
  for (const anchor of anchors) {
    if (anchor.params.slug) {
      slugSet.add(anchor.params.slug);
    }
  }
  return Array.from(slugSet);
}

/**
 * Resolve default values for anchor parameters based on context.
 * For example, if a solution anchor is missing a slug, it defaults to the current problem's slug.
 *
 * @param params - The parsed anchor parameters
 * @param contextSlug - The current problem's slug (used as default for missing slug)
 * @returns Parameters with defaults applied
 */
export function resolveAnchorDefaults(
  params: AnchorParams,
  contextSlug?: string
): AnchorParams {
  const resolved = { ...params };

  // Default slug to context slug if missing
  if (!resolved.slug && contextSlug) {
    resolved.slug = contextSlug;
  }

  // Default source to 'official' for solution anchors if missing
  // (This is a reasonable default for official solutions)
  // Note: We can't determine anchor type here, so caller should handle this

  return resolved;
}
