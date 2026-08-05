// tests/notes/anchor-parser.test.ts
// Ticket 06 & 08: anchor parsing and rewriting tests
import { describe, it, expect } from 'vitest';
import {
  parseAnchors,
  findAnchorsBySlug,
  findAnchorsByType,
  buildAnchorOpen,
  buildAnchorClose,
  replaceAnchorContent,
  extractSlugs,
  resolveAnchorDefaults,
  VALID_SOURCES,
} from '../../src/notes/AnchorParser';
import {
  rewriteAnchorByParams,
  rewriteAnchorsForSlug,
  appendAnchorRegion,
} from '../../src/notes/AnchorRewriter';

describe('parseAnchors', () => {
  it('parses anchor with no parameters', () => {
    const body = '<!-- lc:problem -->\ncontent\n<!-- /lc:problem -->';
    const anchors = parseAnchors(body);
    expect(anchors).toHaveLength(1);
    const [first] = anchors;
    expect(first).toBeDefined();
    expect(first!.type).toBe('problem');
    expect(first!.params).toEqual({});
    expect(body.slice(first!.contentStart, first!.contentEnd)).toBe('\ncontent\n');
  });

  it('parses anchor with slug parameter', () => {
    const body = '<!-- lc:problem slug="two-sum" -->\ncontent\n<!-- /lc:problem -->';
    const anchors = parseAnchors(body);
    expect(anchors).toHaveLength(1);
    const [first] = anchors;
    expect(first).toBeDefined();
    expect(first!.type).toBe('problem');
    expect(first!.params.slug).toBe('two-sum');
  });

  it('parses anchor with multiple parameters', () => {
    const body = '<!-- lc:solution slug="two-sum" source="url" url="https://..." -->\ncontent\n<!-- /lc:solution -->';
    const anchors = parseAnchors(body);
    expect(anchors).toHaveLength(1);
    const [first] = anchors;
    expect(first).toBeDefined();
    expect(first!.params.slug).toBe('two-sum');
    expect(first!.params.source).toBe('url');
    expect(first!.params.url).toBe('https://...');
  });

  it('parses multiple anchors', () => {
    const body = `
<!-- lc:problem slug="two-sum" -->
problem content
<!-- /lc:problem -->

<!-- lc:code slug="two-sum" -->
code content
<!-- /lc:code -->

<!-- lc:problem slug="three-sum" -->
another problem
<!-- /lc:problem -->
`;
    const anchors = parseAnchors(body);
    expect(anchors).toHaveLength(3);
    const [first, second, third] = anchors;
    expect(first).toBeDefined();
    expect(first!.type).toBe('problem');
    expect(first!.params.slug).toBe('two-sum');
    expect(second).toBeDefined();
    expect(second!.type).toBe('code');
    expect(second!.params.slug).toBe('two-sum');
    expect(third).toBeDefined();
    expect(third!.type).toBe('problem');
    expect(third!.params.slug).toBe('three-sum');
  });
});

describe('findAnchorsBySlug', () => {
  it('finds all anchors for a specific slug', () => {
    const body = `
<!-- lc:problem slug="two-sum" -->
problem
<!-- /lc:problem -->

<!-- lc:code slug="two-sum" -->
code
<!-- /lc:code -->

<!-- lc:problem slug="three-sum" -->
another
<!-- /lc:problem -->
`;
    const found = findAnchorsBySlug(body, 'two-sum');
    expect(found).toHaveLength(2);
    const [first, second] = found;
    expect(first).toBeDefined();
    expect(first!.type).toBe('problem');
    expect(second).toBeDefined();
    expect(second!.type).toBe('code');
  });

  it('returns empty array when slug not found', () => {
    const body = '<!-- lc:problem slug="two-sum" -->content<!-- /lc:problem -->';
    const found = findAnchorsBySlug(body, 'three-sum');
    expect(found).toHaveLength(0);
  });
});

describe('findAnchorsByType', () => {
  it('finds all anchors of a specific type', () => {
    const body = `
<!-- lc:problem slug="two-sum" -->
problem
<!-- /lc:problem -->

<!-- lc:problem slug="three-sum" -->
another
<!-- /lc:problem -->

<!-- lc:code slug="two-sum" -->
code
<!-- /lc:code -->
`;
    const found = findAnchorsByType(body, 'problem');
    expect(found).toHaveLength(2);
  });
});

describe('buildAnchorOpen / buildAnchorClose', () => {
  it('builds anchor with no parameters', () => {
    expect(buildAnchorOpen('problem')).toBe('<!-- lc:problem -->');
    expect(buildAnchorClose('problem')).toBe('<!-- /lc:problem -->');
  });

  it('builds anchor with parameters', () => {
    const open = buildAnchorOpen('solution', {
      slug: 'two-sum',
      source: 'url',
      url: 'https://...',
    });
    expect(open).toContain('slug="two-sum"');
    expect(open).toContain('source="url"');
    expect(open).toContain('url="https://..."');
  });
});

describe('replaceAnchorContent', () => {
  it('replaces content within an anchor', () => {
    const body = '<!-- lc:problem -->\nold content\n<!-- /lc:problem -->';
    const anchors = parseAnchors(body);
    expect(anchors).toHaveLength(1);
    const [first] = anchors;
    expect(first).toBeDefined();
    const updated = replaceAnchorContent(body, first!, 'new content');
    expect(updated).toBe('<!-- lc:problem -->\nnew content\n<!-- /lc:problem -->');
  });
});

describe('extractSlugs', () => {
  it('extracts all unique slugs from anchors', () => {
    const body = `
<!-- lc:problem slug="two-sum" -->
problem
<!-- /lc:problem -->

<!-- lc:code slug="two-sum" -->
code
<!-- /lc:code -->

<!-- lc:problem slug="three-sum" -->
another
<!-- /lc:problem -->
`;
    const slugs = extractSlugs(body);
    expect(slugs).toHaveLength(2);
    expect(slugs).toContain('two-sum');
    expect(slugs).toContain('three-sum');
  });
});

describe('rewriteAnchorByParams', () => {
  it('rewrites anchor matching type and params', () => {
    const body = '<!-- lc:problem slug="two-sum" -->\nold\n<!-- /lc:problem -->';
    const updated = rewriteAnchorByParams(body, 'problem', { slug: 'two-sum' }, 'new');
    expect(updated).toBe('<!-- lc:problem slug="two-sum" -->\nnew\n<!-- /lc:problem -->');
  });

  it('returns null when no matching anchor found', () => {
    const body = '<!-- lc:problem slug="two-sum" -->\nold\n<!-- /lc:problem -->';
    const updated = rewriteAnchorByParams(body, 'problem', { slug: 'three-sum' }, 'new');
    expect(updated).toBeNull();
  });
});

describe('rewriteAnchorsForSlug', () => {
  it('rewrites all anchors of a type for a specific slug', () => {
    const body = `
<!-- lc:problem slug="two-sum" -->
old problem
<!-- /lc:problem -->

<!-- lc:problem slug="three-sum" -->
another problem
<!-- /lc:problem -->
`;
    const updated = rewriteAnchorsForSlug(body, 'two-sum', 'problem', 'new problem');
    expect(updated).toContain('new problem');
    expect(updated).toContain('another problem');
    expect(updated).not.toContain('old problem');
  });
});

describe('appendAnchorRegion', () => {
  it('appends anchor region to body', () => {
    const body = '# My Note\n\nSome content.';
    const updated = appendAnchorRegion(body, 'problem', { slug: 'two-sum' }, 'problem content');
    expect(updated).toContain('# My Note');
    expect(updated).toContain('<!-- lc:problem slug="two-sum" -->');
    expect(updated).toContain('problem content');
    expect(updated).toContain('<!-- /lc:problem -->');
  });

  it('appends with optional heading', () => {
    const body = '# My Note';
    const updated = appendAnchorRegion(body, 'problem', { slug: 'two-sum' }, 'content', '## Problem');
    expect(updated).toContain('## Problem');
    expect(updated).toContain('<!-- lc:problem slug="two-sum" -->');
  });
});

describe('Parameter parsing (normalize & validation)', () => {
  it('parses unquoted parameter values', () => {
    const body = '<!-- lc:solution slug=two-sum source=official -->\ncontent\n<!-- /lc:solution -->';
    const anchors = parseAnchors(body);
    expect(anchors).toHaveLength(1);
    const [first] = anchors;
    expect(first).toBeDefined();
    expect(first!.params.slug).toBe('two-sum');
    expect(first!.params.source).toBe('official');
  });

  it('parses mixed quoted and unquoted values', () => {
    const body = '<!-- lc:solution slug="two-sum" source=official url=https://example.com -->\ncontent\n<!-- /lc:solution -->';
    const anchors = parseAnchors(body);
    expect(anchors).toHaveLength(1);
    const [first] = anchors;
    expect(first).toBeDefined();
    expect(first!.params.slug).toBe('two-sum');
    expect(first!.params.source).toBe('official');
    expect(first!.params.url).toBe('https://example.com');
  });

  it('handles parameters in any order (order-independent)', () => {
    const body1 = '<!-- lc:solution slug=two-sum source=url url=https://example.com -->\ncontent\n<!-- /lc:solution -->';
    const body2 = '<!-- lc:solution url=https://example.com source=url slug=two-sum -->\ncontent\n<!-- /lc:solution -->';
    const body3 = '<!-- lc:solution source=url url=https://example.com slug=two-sum -->\ncontent\n<!-- /lc:solution -->';

    const anchors1 = parseAnchors(body1);
    const anchors2 = parseAnchors(body2);
    const anchors3 = parseAnchors(body3);

    expect(anchors1).toHaveLength(1);
    expect(anchors2).toHaveLength(1);
    expect(anchors3).toHaveLength(1);

    const [a1, a2, a3] = [anchors1[0]!, anchors2[0]!, anchors3[0]!];
    expect(a1.params).toEqual(a2.params);
    expect(a2.params).toEqual(a3.params);
    expect(a1.params.slug).toBe('two-sum');
    expect(a1.params.source).toBe('url');
    expect(a1.params.url).toBe('https://example.com');
  });

  it('validates source parameter against allowed values', () => {
    // Valid sources should be parsed
    const validBody = '<!-- lc:solution source=official -->\ncontent\n<!-- /lc:solution -->';
    const validAnchors = parseAnchors(validBody);
    expect(validAnchors[0]!.params.source).toBe('official');

    // Invalid sources should be silently ignored
    const invalidBody = '<!-- lc:solution source=invalid -->\ncontent\n<!-- /lc:solution -->';
    const invalidAnchors = parseAnchors(invalidBody);
    expect(invalidAnchors[0]!.params.source).toBeUndefined();
  });

  it('accepts all valid source values', () => {
    for (const source of VALID_SOURCES) {
      const body = `<!-- lc:solution source=${source} -->\ncontent\n<!-- /lc:solution -->`;
      const anchors = parseAnchors(body);
      expect(anchors[0]!.params.source).toBe(source);
    }
  });
});

describe('resolveAnchorDefaults', () => {
  it('fills missing slug with context slug', () => {
    const params = { source: 'official' };
    const resolved = resolveAnchorDefaults(params, 'two-sum');
    expect(resolved.slug).toBe('two-sum');
    expect(resolved.source).toBe('official');
  });

  it('preserves existing slug', () => {
    const params = { slug: 'three-sum', source: 'official' };
    const resolved = resolveAnchorDefaults(params, 'two-sum');
    expect(resolved.slug).toBe('three-sum');
  });

  it('handles missing context slug gracefully', () => {
    const params = { source: 'official' };
    const resolved = resolveAnchorDefaults(params);
    expect(resolved.slug).toBeUndefined();
  });
});

describe('Precise anchor matching', () => {
  it('throws error when multiple anchors match (ambiguous match)', () => {
    const body = `
<!-- lc:solution slug="two-sum" source="url" url="https://example1.com" -->
solution 1
<!-- /lc:solution -->

<!-- lc:solution slug="two-sum" source="url" url="https://example2.com" -->
solution 2
<!-- /lc:solution -->
`;

    // Matching with slug+source only should throw (ambiguous)
    expect(() => {
      rewriteAnchorByParams(body, 'solution', { slug: 'two-sum', source: 'url' }, 'new content');
    }).toThrow(/Ambiguous match: 2 anchors/);
  });

  it('precisely matches anchor with all distinguishing params', () => {
    const body = `
<!-- lc:solution slug="two-sum" source="url" url="https://example1.com" -->
solution 1
<!-- /lc:solution -->

<!-- lc:solution slug="two-sum" source="url" url="https://example2.com" -->
solution 2
<!-- /lc:solution -->
`;

    // Matching with slug+source+url should uniquely identify the anchor
    const updated = rewriteAnchorByParams(
      body,
      'solution',
      { slug: 'two-sum', source: 'url', url: 'https://example2.com' },
      'updated solution 2'
    );

    expect(updated).not.toBeNull();
    expect(updated).toContain('updated solution 2');
    expect(updated).toContain('solution 1'); // First solution unchanged
  });

  it('matches single anchor without ambiguity', () => {
    const body = '<!-- lc:solution slug="two-sum" source="official" -->\ncontent\n<!-- /lc:solution -->';
    const updated = rewriteAnchorByParams(
      body,
      'solution',
      { slug: 'two-sum', source: 'official' },
      'new content'
    );
    expect(updated).not.toBeNull();
    expect(updated).toContain('new content');
  });
});
