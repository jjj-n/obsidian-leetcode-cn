// tests/notes/solution-marker.test.ts
// Ticket 09: Solution marker parsing and empty anchor detection tests

import { describe, it, expect } from 'vitest';
import {
  parseSolutionMarkers,
  findEmptySolutionAnchors,
  findNearestEmptySolutionAnchor,
  removeMarkers,
  updateAnchorUrl,
} from '../../src/notes/SolutionMarker';

describe('parseSolutionMarkers', () => {
  it('parses marker with English colon', () => {
    const content = '# My Note\n\n题解链接: https://leetcode.cn/problems/two-sum/solutions/abc/\n\nSome text';
    const markers = parseSolutionMarkers(content);

    expect(markers).toHaveLength(1);
    expect(markers[0]!.url).toBe('https://leetcode.cn/problems/two-sum/solutions/abc/');
    expect(markers[0]!.lineNumber).toBe(2);
  });

  it('parses marker with Chinese colon', () => {
    const content = '题解链接：https://leetcode.cn/problems/two-sum/solutions/abc/';
    const markers = parseSolutionMarkers(content);

    expect(markers).toHaveLength(1);
    expect(markers[0]!.url).toBe('https://leetcode.cn/problems/two-sum/solutions/abc/');
  });

  it('parses marker with leading/trailing whitespace', () => {
    const content = '  题解链接: https://leetcode.cn/problems/two-sum/solutions/abc/  ';
    const markers = parseSolutionMarkers(content);

    expect(markers).toHaveLength(1);
    expect(markers[0]!.url).toBe('https://leetcode.cn/problems/two-sum/solutions/abc/');
  });

  it('parses multiple markers', () => {
    const content = `# My Note

题解链接: https://leetcode.cn/problems/two-sum/solutions/abc/

Some text

题解链接：https://leetcode.cn/problems/two-sum/solutions/def/
`;
    const markers = parseSolutionMarkers(content);

    expect(markers).toHaveLength(2);
    expect(markers[0]!.url).toBe('https://leetcode.cn/problems/two-sum/solutions/abc/');
    expect(markers[1]!.url).toBe('https://leetcode.cn/problems/two-sum/solutions/def/');
  });

  it('ignores non-marker lines', () => {
    const content = `# My Note

This is not a marker
题解链接 is not complete
https://leetcode.cn/problems/two-sum/solutions/abc/

题解链接: https://leetcode.cn/problems/two-sum/solutions/valid/
`;
    const markers = parseSolutionMarkers(content);

    expect(markers).toHaveLength(1);
    expect(markers[0]!.url).toBe('https://leetcode.cn/problems/two-sum/solutions/valid/');
  });

  it('returns empty array when no markers found', () => {
    const content = '# My Note\n\nSome text without markers';
    const markers = parseSolutionMarkers(content);

    expect(markers).toHaveLength(0);
  });
});

describe('findEmptySolutionAnchors', () => {
  it('finds empty solution anchor', () => {
    const content = `# My Note

<!-- lc:solution slug="two-sum" source="url" url="" -->

<!-- /lc:solution -->
`;
    const emptyAnchors = findEmptySolutionAnchors(content);

    expect(emptyAnchors).toHaveLength(1);
    expect(emptyAnchors[0]!.type).toBe('solution');
    expect(emptyAnchors[0]!.params.slug).toBe('two-sum');
  });

  it('finds multiple empty solution anchors', () => {
    const content = `<!-- lc:solution slug="two-sum" source="url" url="" -->

<!-- /lc:solution -->

<!-- lc:solution slug="two-sum" source="url" url="" -->

<!-- /lc:solution -->
`;
    const emptyAnchors = findEmptySolutionAnchors(content);

    expect(emptyAnchors).toHaveLength(2);
  });

  it('ignores non-empty solution anchors', () => {
    const content = `<!-- lc:solution slug="two-sum" source="url" url="" -->
Some solution content
<!-- /lc:solution -->

<!-- lc:solution slug="two-sum" source="url" url="" -->

<!-- /lc:solution -->
`;
    const emptyAnchors = findEmptySolutionAnchors(content);

    expect(emptyAnchors).toHaveLength(1);
  });

  it('ignores non-solution anchors', () => {
    const content = `<!-- lc:problem slug="two-sum" -->

<!-- /lc:problem -->

<!-- lc:solution slug="two-sum" source="url" url="" -->

<!-- /lc:solution -->
`;
    const emptyAnchors = findEmptySolutionAnchors(content);

    expect(emptyAnchors).toHaveLength(1);
    expect(emptyAnchors[0]!.type).toBe('solution');
  });

  it('returns empty array when no empty anchors found', () => {
    const content = `<!-- lc:solution slug="two-sum" source="url" url="" -->
Content
<!-- /lc:solution -->
`;
    const emptyAnchors = findEmptySolutionAnchors(content);

    expect(emptyAnchors).toHaveLength(0);
  });
});

describe('findNearestEmptySolutionAnchor', () => {
  it('finds nearest anchor forward', () => {
    const content = `Line 0
Line 1
题解链接: https://leetcode.cn/problems/two-sum/solutions/abc/
Line 3
Line 4
<!-- lc:solution slug="two-sum" source="url" url="" -->

<!-- /lc:solution -->
`;
    const anchor = findNearestEmptySolutionAnchor(content, 2);

    expect(anchor).not.toBeNull();
    expect(anchor!.type).toBe('solution');
  });

  it('finds nearest anchor backward', () => {
    const content = `<!-- lc:solution slug="two-sum" source="url" url="" -->

<!-- /lc:solution -->
Line 3
Line 4
题解链接: https://leetcode.cn/problems/two-sum/solutions/abc/
`;
    const anchor = findNearestEmptySolutionAnchor(content, 5);

    expect(anchor).not.toBeNull();
    expect(anchor!.type).toBe('solution');
  });

  it('returns null when no empty anchors exist', () => {
    const content = `题解链接: https://leetcode.cn/problems/two-sum/solutions/abc/
No empty anchors here
`;
    const anchor = findNearestEmptySolutionAnchor(content, 0);

    expect(anchor).toBeNull();
  });
});

describe('removeMarkers', () => {
  it('removes single marker line', () => {
    const content = `# My Note

题解链接: https://leetcode.cn/problems/two-sum/solutions/abc/

Some text`;
    const markers = parseSolutionMarkers(content);
    const result = removeMarkers(content, markers);

    expect(result).not.toContain('题解链接');
    expect(result).toContain('# My Note');
    expect(result).toContain('Some text');
  });

  it('removes multiple marker lines', () => {
    const content = `题解链接: https://leetcode.cn/problems/two-sum/solutions/abc/
Line 2
题解链接：https://leetcode.cn/problems/two-sum/solutions/def/
Line 4`;
    const markers = parseSolutionMarkers(content);
    const result = removeMarkers(content, markers);

    expect(result).not.toContain('题解链接');
    expect(result).toContain('Line 2');
    expect(result).toContain('Line 4');
  });

  it('returns original content when no markers to remove', () => {
    const content = '# My Note\n\nSome text';
    const result = removeMarkers(content, []);

    expect(result).toBe(content);
  });
});

describe('updateAnchorUrl', () => {
  it('updates anchor with URL parameter', () => {
    const content = `<!-- lc:solution slug="two-sum" source="url" url="" -->

<!-- /lc:solution -->`;
    const emptyAnchors = findEmptySolutionAnchors(content);
    const anchor = emptyAnchors[0]!;

    const result = updateAnchorUrl(content, anchor, 'https://leetcode.cn/problems/two-sum/solutions/abc/');

    expect(result).toContain('url="https://leetcode.cn/problems/two-sum/solutions/abc/"');
    expect(result).toContain('source="url"');
    expect(result).toContain('slug="two-sum"');
  });

  it('preserves other anchor parameters', () => {
    const content = `<!-- lc:solution slug="two-sum" index="1" url="" -->

<!-- /lc:solution -->`;
    const emptyAnchors = findEmptySolutionAnchors(content);
    const anchor = emptyAnchors[0]!;

    const result = updateAnchorUrl(content, anchor, 'https://leetcode.cn/problems/two-sum/solutions/abc/');

    expect(result).toContain('slug="two-sum"');
    expect(result).toContain('index="1"');
    expect(result).toContain('url="https://leetcode.cn/problems/two-sum/solutions/abc/"');
  });
});
