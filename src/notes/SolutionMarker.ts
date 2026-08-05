// src/notes/SolutionMarker.ts
// Ticket 09: Solution marker parsing and empty anchor detection

import { parseAnchors, buildAnchorOpen, type AnchorRegion } from './AnchorParser';

/**
 * Represents a solution marker line in a note
 */
export interface SolutionMarker {
  line: string;
  lineNumber: number;
  url: string;
}

/**
 * Parse solution markers from note content.
 * Recognizes lines like:
 * - `题解链接: https://leetcode.cn/problems/two-sum/solutions/xxx/`
 * - `题解链接：https://...` (Chinese colon)
 * - `  题解链接: https://...  ` (with whitespace)
 *
 * @param content - The note content
 * @returns Array of solution markers found
 */
export function parseSolutionMarkers(content: string): SolutionMarker[] {
  const markers: SolutionMarker[] = [];
  const lines = content.split('\n');

  // Match pattern: optional whitespace, "题解链接", colon (Chinese or English), optional whitespace, URL
  const markerPattern = /^(\s*题解链接\s*[:：]\s*)(https?:\/\/.+?)\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const match = markerPattern.exec(line);

    if (match && match[2]) {
      markers.push({
        line: line,
        lineNumber: i,
        url: match[2],
      });
    }
  }

  return markers;
}

/**
 * Find empty solution anchors in a note.
 * An anchor is considered "empty" if its content is empty or only whitespace.
 *
 * @param content - The note content
 * @returns Array of empty solution anchors
 */
export function findEmptySolutionAnchors(content: string): AnchorRegion[] {
  const anchors = parseAnchors(content);
  const emptyAnchors: AnchorRegion[] = [];

  for (const anchor of anchors) {
    if (anchor.type !== 'solution') continue;

    // Extract content between opening and closing tags
    const anchorContent = content.slice(anchor.contentStart, anchor.contentEnd);
    const trimmedContent = anchorContent.trim();

    // Anchor is empty if content is empty or only whitespace
    if (trimmedContent === '') {
      emptyAnchors.push(anchor);
    }
  }

  return emptyAnchors;
}

/**
 * Find the nearest empty solution anchor to a given line number.
 * Searches both forward and backward from the line, preferring forward.
 *
 * @param content - The note content
 * @param lineNumber - The line number to search from
 * @param precomputedEmptyAnchors - Optional pre-computed empty anchors to avoid recomputation
 * @returns The nearest empty solution anchor, or null if none found
 */
export function findNearestEmptySolutionAnchor(
  content: string,
  lineNumber: number,
  precomputedEmptyAnchors?: AnchorRegion[]
): AnchorRegion | null {
  const emptyAnchors = precomputedEmptyAnchors ?? findEmptySolutionAnchors(content);

  if (emptyAnchors.length === 0) {
    return null;
  }

  // Convert line numbers to character offsets for comparison
  const lines = content.split('\n');
  let charOffset = 0;
  for (let i = 0; i < lineNumber && i < lines.length; i++) {
    const line = lines[i];
    if (line) {
      charOffset += line.length + 1; // +1 for newline
    }
  }

  // Find the nearest anchor by character offset
  let nearest: AnchorRegion | null = null;
  let minDistance = Infinity;

  for (const anchor of emptyAnchors) {
    const anchorMidpoint = (anchor.startOffset + anchor.endOffset) / 2;
    const distance = Math.abs(anchorMidpoint - charOffset);

    if (distance < minDistance) {
      minDistance = distance;
      nearest = anchor;
    }
  }

  return nearest;
}

/**
 * Remove marker lines from content.
 *
 * @param content - The note content
 * @param markers - Array of markers to remove
 * @returns Content with marker lines removed
 */
export function removeMarkers(content: string, markers: SolutionMarker[]): string {
  if (markers.length === 0) {
    return content;
  }

  const lines = content.split('\n');

  // Create a set of line numbers to remove
  const lineNumbersToRemove = new Set(markers.map(m => m.lineNumber));

  // Filter out marker lines
  const filteredLines = lines.filter((_, index) => !lineNumbersToRemove.has(index));

  return filteredLines.join('\n');
}

/**
 * Update an anchor's URL parameter.
 * This rewrites the anchor opening tag to include the URL.
 *
 * @param content - The note content
 * @param anchor - The anchor to update
 * @param url - The URL to add
 * @returns Updated content
 */
export function updateAnchorUrl(
  content: string,
  anchor: AnchorRegion,
  url: string
): string {
  // Build new opening tag with URL using buildAnchorOpen
  const params = { ...anchor.params, url, source: 'url' };
  const newOpeningTag = buildAnchorOpen(anchor.type, params);

  // Replace the old opening tag with the new one
  return content.slice(0, anchor.startOffset) + newOpeningTag + content.slice(anchor.contentStart);
}
