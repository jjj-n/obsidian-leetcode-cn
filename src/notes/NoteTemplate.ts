// src/notes/NoteTemplate.ts
// Schema single source of truth for Phase 2 note creation (D-03).
//
// NO OTHER MODULE may hardcode:
//   - `lc-` prefixed frontmatter key names (PLUGIN_LC_KEYS)
//   - the `lc/` tag namespace (LC_TAG_PREFIX)
//   - the `lc-status` value vocabulary (LC_STATUS_VALUES)
//   - the `{id}-{slug}.md` filename pattern (buildNoteFilename)
//   - the two-heading body layout (`## Problem` + `## Notes`) (buildNoteBody)
//
// Template v2 (cn): the note shape mirrors the user's hand-tuned vault
// template — Chinese property vocabulary (created/分类/难度/分数/情况/…),
// a 链接 line under frontmatter, and a 最近刷题回顾 dataview block. The
// plugin writes exactly 4 lc-* keys (lc-slug, lc-status, lc-language + the
// lc-slugs multi-problem variant); retired identity keys are deleted on
// rewrite. applySolveTimeFrontmatter keeps the AC-time lc/{slug} tag union.
//
// GAP-2a closure: this module also owns the IndexedProblem.status →
// lc-status mapping (see `mapStatusDisplay`). Callers pass the internal
// vocabulary ('solved' | 'attempted' | 'untouched'); we return the
// frontmatter vocabulary ('accepted' | 'attempted' | 'untouched').

import type { App, TFile } from 'obsidian';
import type { DetailCacheEntry } from './types';

/** The lc-* frontmatter keys the plugin OWNS. lc-slug/lc-slugs identify the
 *  note for re-open + anchor refresh; lc-status tracks solve progress;
 *  lc-language is the code-language source of truth. The identity keys the
 *  v0.1 template used to write (lc-id/lc-title/lc-difficulty/lc-url/lc-region)
 *  were retired when the default template moved to the user's Chinese
 *  property vocabulary (created/分类/难度/…) — they had no production readers
 *  and are DELETED on rewrite as part of old-note migration. */
export const PLUGIN_LC_KEYS = [
  'lc-slug',
  'lc-slugs',
  'lc-status',
  'lc-language',
] as const;

/** Retired plugin-owned keys. Deleted (not just stopped-writing) inside
 *  applyFrontmatter so pre-retirement notes migrate to the clean shape on
 *  their next re-open. Safe to delete unconditionally: the `lc-` namespace
 *  is plugin-owned. */
const RETIRED_LC_KEYS = [
  'lc-id',
  'lc-title',
  'lc-difficulty',
  'lc-url',
  'lc-region',
] as const;

/** Canonical tag namespace prefix. All LC-derived tags begin with this. */
export const LC_TAG_PREFIX = 'lc/' as const;

// Schema SSoT for every plugin-owned H2 heading across Phases 2, 3, and 4.
// Canonical anchor order in problem notes (Phase 4 D-14):
//   ## Problem → ## Code → ## Notes → ## Techniques → ## Custom Tests
// Phase 2 canonical headings:
/** Plugin-owned H2 where the problem markdown lives (rewriteProblemSection target). */
export const PROBLEM_HEADING_LINE = '## Problem' as const;
/** User-owned H2 immediately after `## Problem`; plugin never writes into this region. */
export const NOTES_HEADING_LINE = '## Notes' as const;
// Phase 3 heading extensions (CONTEXT D-06, D-20).
/** Plugin-owned H2 under which the user's solution fenced block lives. */
export const CODE_HEADING_LINE = '## Code' as const;
/** Plugin-owned H2 under which persisted `### Case N` subheadings live. Lazy-created (D-18). */
export const CUSTOM_TESTS_HEADING_LINE = '## Custom Tests' as const;
/** Prefix for each custom-test subheading. Trailing space matches `### Case 1` (D-18). */
export const CASE_HEADING_PREFIX = '### Case ' as const;
// Phase 4 heading extension (Plan 04-02, D-14).
/** Plugin-owned H2 housing `[[Technique]]` wikilinks, union-merged with user
 *  additions on every Accepted submission (D-13). Inserted immediately after
 *  `## Notes` when absent (D-14). */
export const TECHNIQUES_HEADING_LINE = '## Techniques' as const;
// Phase 09 heading extension (AIREV-01, D-19).
/** Plugin-owned H2 where the AI-generated review content lives. Heading locked
 *  (like ## Techniques / ## Notes); body editable by the AI writer. */
export const AI_REVIEW_HEADING_LINE = '## AI Review' as const;
// Phase 11 heading extension (AIKG-05, D-15).
/** Plugin-owned H2 where AI-suggested cross-cluster structural variants live.
 *  Heading locked (AIKG-07, D-15); body editable by the AI writer. Inserted
 *  after ## Techniques and before ## AI Review in the canonical section order. */
export const RELATED_VARIANTS_HEADING_LINE = '## Related Variants' as const;
// Phase 10 heading extension (CONTEST-07, D-17/D-21).
/** Plugin-owned H2 where AI-generated contest analysis lives on summary notes.
 *  NOT added to LOCKED_HEADINGS — it applies only to summary notes, not problem
 *  notes with section lock (per 10-PATTERNS.md). */
export const AI_ANALYSIS_HEADING_LINE = '## AI Analysis' as const;

/**
 * Phase 05.5 D-01 / D-03 — the five heading lines locked by `sectionLockExtension`.
 * Order matches the canonical anchor order from Phase 4 D-14 (## Problem → ## Code →
 * ## Techniques → ## Notes → ## AI Review). `## Custom Tests` is intentionally NOT
 * in this array (Phase 5 D-08 ignores it on read/write; Phase 05.5 D-03 leaves it editable).
 *
 * SSoT invariant (Phase 2 D-03): heading literals come from this module — no
 * other module hardcodes these strings. The lock extension imports this tuple
 * directly so `## Custom Tests` cannot accidentally be added to the lock surface.
 */
export const LOCKED_HEADINGS = [
  PROBLEM_HEADING_LINE,
  CODE_HEADING_LINE,
  TECHNIQUES_HEADING_LINE,
  NOTES_HEADING_LINE,
  RELATED_VARIANTS_HEADING_LINE,
  AI_REVIEW_HEADING_LINE,
] as const;

/**
 * Renders a `\`\`\`leetcode-solve` fenced code block with the given starter
 * code. Caller appends trailing newline as needed.
 *
 * Phase 22 — the v1.2 langSlug-fence emitter retired with the v1.2 path.
 * Language metadata lives in `lc-language` frontmatter (canonical v1.3
 * source of truth per Phase 19 C-01); the fence opener is fixed at
 * `leetcode-solve` for every new note. Trim semantics: leading/trailing
 * whitespace stripped, internal whitespace preserved.
 */
export function codeBlockFor(starterCode: string): string {
  const code = starterCode.trim();
  return '```leetcode-solve\n' + code + '\n```';
}

/**
 * Vocabulary for the `lc-status` frontmatter field. Single source of truth (D-03).
 * Phase 2 writes 'untouched' or 'attempted' on first open; Phase 4 will flip to
 * 'accepted' on first Accepted submission. GAP-2a lets Phase 2 also write
 * 'accepted' or 'attempted' on first open when the user's LC submission history
 * already reflects that status.
 */
export const LC_STATUS_VALUES = ['accepted', 'attempted', 'untouched'] as const;
export type LcStatus = typeof LC_STATUS_VALUES[number];

export interface NoteTemplateInput {
  id: number;
  slug: string;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  url: string;
  /** Per NOTE-09: read from SettingsStore.getDefaultLanguage() at the caller site. */
  language: string;
  /**
   * The plugin's current-pass tag set — union-merged into frontmatter tags
   * INSIDE applyFrontmatter's processFrontMatter callback. Template v2
   * passes [] (tags come from the template: leetcode + language); solve-time
   * writers still contribute `lc/{slug}` tags on AC.
   */
  pluginTags: string[];
  /**
   * Phase 08: optional array of slugs for multi-problem-per-note support.
   * When provided, the note will use `lc-slugs` array in frontmatter.
   * When omitted, the note uses `lc-slug` (single problem).
   */
  slugs?: string[];
  /**
   * Caller-supplied hint for the on-first-write value of `lc-status` (GAP-2a).
   * D-04 preservation: applyFrontmatter NEVER downgrades an existing 'accepted'
   * value, regardless of this hint. Use `mapStatusDisplay` to derive this from
   * an IndexedProblem row's internal vocabulary.
   * Undefined → default to 'untouched' (back-compat).
   */
  initialStatus?: LcStatus;
}

/** D-16: unpadded filename like `1-two-sum.md`, `10-regular-expression-matching.md`, `100-same-tree.md`. */
export function buildNoteFilename(id: number, slug: string): string {
  return `${id}-${slug}.md`;
}

/** Strip trailing slashes from the folder, join with the unpadded filename. */
export function buildNotePath(folder: string, id: number, slug: string): string {
  const trimmed = folder.replace(/[\\/]+$/, '');
  return `${trimmed}/${buildNoteFilename(id, slug)}`;
}

/**
 * Map IndexedProblem.status → lc-status frontmatter value (GAP-2a SSoT).
 *   'solved'    → 'accepted'   (LC's `ac` means Accepted)
 *   'attempted' → 'attempted'
 *   'untouched' → 'untouched'
 *   undefined   → 'untouched'  (no hint from caller; safe default)
 *
 * This is the ONE place that translates the internal IndexedProblem vocabulary
 * to the on-disk lc-status vocabulary. D-03 bans any other module from
 * hardcoding these literals.
 */
export function mapStatusDisplay(
  indexStatus: 'solved' | 'attempted' | 'untouched' | undefined,
): LcStatus {
  if (indexStatus === 'solved') return 'accepted';
  if (indexStatus === 'attempted') return 'attempted';
  return 'untouched';
}

/**
 * Phase 3 D-06: Body layout is `## Problem` → `## Code` → `## Notes`.
 * `## Solution` and `## Techniques` are added by Phase 4 on first Accepted submission.
 * `## Custom Tests` is a legacy Phase 3 section; Phase 5 ignores it on read and write (POLISH-07 D-08).
 *
 * Phase 22 — `langSlug` accepted for back-compat but the fence opener is
 * always `\`\`\`leetcode-solve` (v1.3 widget mount path). The legacy
 * `\`\`\`<langSlug>` emitter retired with the v1.2 path; language
 * metadata moved to `lc-language` frontmatter.
 */
export function buildNoteBody(input: {
  problemMarkdown: string;
  /** Reserved for back-compat with existing call sites; not consumed in v1.3
   *  (language lives in `lc-language` frontmatter). */
  langSlug?: string;
  starterCode?: string;
  /** Phase 12 Plan 03 (D-11) — optional H1 title prepended before ## Problem.
   *  When provided, output starts with `# {Title}\n\n## Problem`. When omitted,
   *  output starts with `## Problem` (backward-compat for existing callers). */
  title?: string;
}): string {
  const starter = input.starterCode ?? '';
  const codeBlock = codeBlockFor(starter);
  const h1 = input.title ? `# ${input.title}\n` : '';
  // Phase 22 D-polish-08 — blank line between `## Code` and the fence
  // (regression from v1.2 — pre-v1.3 templates had this gap; the v1.3
  // emitter rewrite collapsed it to a single newline). Visual breathing
  // room + reader-source consistency. Mirrors the existing `## Notes\n\n`
  // pattern at the end of the body.
  return `${h1}## Problem\n${input.problemMarkdown.trim()}\n\n${CODE_HEADING_LINE}\n\n${codeBlock}\n\n## Notes\n\n`;
}

/**
 * Build the frontmatter input from a cached detail entry + user's default language.
 * D-05: Phase 2 derives pluginTags from difficulty only. Phase 4 will rebuild this
 * with difficulty + topic tags derived from detail.topicSlugs.
 *
 * GAP-2a: optional 3rd arg `initialStatus` is the already-mapped lc-status
 * vocabulary (use `mapStatusDisplay` to translate from IndexedProblem.status).
 * When omitted, applyFrontmatter defaults the on-disk value to 'untouched' per
 * D-04 back-compat.
 */
export function buildFrontmatterInput(
  detail: DetailCacheEntry,
  defaultLanguage: string,
  initialStatus?: LcStatus,
  /** Phase 08: when adding to multi-problem note, pass the slug to track. */
  addSlug?: string,
): NoteTemplateInput {
  const slug = slugFromUrl(detail.url, detail.title);
  const result: NoteTemplateInput = {
    id: detail.id,
    slug,
    title: detail.title,
    difficulty: detail.difficulty,
    url: detail.url,
    language: defaultLanguage,
    // Template v2: no plugin tags by default — the note's tags come from the
    // template (leetcode + language) and 分类/难度 carry the metadata. The
    // union mechanism stays for solve-time writers (applySolveTimeFrontmatter).
    pluginTags: [],
    initialStatus,
  };
  // Phase 08: if adding to multi-problem note, provide slugs array
  if (addSlug) {
    result.slugs = [addSlug];
  }
  return result;
}

/**
 * Recover the slug from the detail.url (preferred) or fall back to a title-derived slug
 * if url is empty. detail.url matches `https://leetcode.com/problems/{slug}/`.
 */
function slugFromUrl(url: string, titleFallback: string): string {
  const m = /\/problems\/([^/]+)\/?/.exec(url);
  if (m && m[1]) return m[1];
  // Fallback — rare; only when cache entry lacks a url (shouldn't happen post-Plan 04).
  return titleFallback.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/**
 * Atomic frontmatter write. All mutations happen INSIDE the callback — this is
 * the only safe shape (CONTEXT.md D-10 + RESEARCH.md Pitfall 1: processFrontMatter
 * does NOT auto-union arrays; union lives in the callback).
 *
 * Semantics (D-10, narrowed for the cn template v2):
 *   lc-* keys       → plugin OVERWRITES the 4 owned keys every pass, with ONE
 *                     exception: lc-status is NEVER downgraded from an existing
 *                     non-'untouched' value back to 'untouched' (D-04 + Phase 4
 *                     respects Phase 2 re-opens). RETIRED keys (lc-id, lc-title,
 *                     lc-difficulty, lc-url, lc-region) are DELETED — old-note
 *                     migration; they duplicated what the body/分类/难度 now carry.
 *   aliases         → NOT written anymore (the default template carries no
 *                     aliases); existing user aliases are left untouched.
 *   tags            → union of plugin's current-pass set (input.pluginTags —
 *                     empty by default since the v2 template) and existing tags
 *   other user keys → untouched (callback simply doesn't mutate them)
 */
export async function applyFrontmatter(
  app: App,
  file: TFile,
  input: NoteTemplateInput,
): Promise<void> {
  await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
    // 0. Retired identity keys — delete for old-note migration.
    for (const key of RETIRED_LC_KEYS) {
      delete fm[key];
    }

    // 1. Plugin-owned lc-* keys.
    // Phase 08: multi-problem-per-note support.
    // Auto-upgrade: if note has lc-slug and we're adding slugs[], convert to lc-slugs.
    if (input.slugs && input.slugs.length > 1) {
      // Multi-problem: use lc-slugs array
      fm['lc-slugs'] = input.slugs;
      delete fm['lc-slug'];
    } else if (input.slugs && input.slugs.length === 1) {
      // Single problem via slugs[]: use lc-slug
      fm['lc-slug'] = input.slugs[0];
      delete fm['lc-slugs'];
    } else {
      // Legacy single problem: use lc-slug
      fm['lc-slug'] = input.slug;
      delete fm['lc-slugs'];
    }
    // D-04 + GAP-2a: on first write (or when the existing value is empty /
    // 'untouched'), adopt the caller's `initialStatus` hint (defaulting to
    // 'untouched' when the caller didn't supply one). NEVER downgrade from an
    // existing 'accepted' — Phase 4 writes 'accepted' on first Accepted
    // submission, and a Phase 2 re-open must not clobber that. Rows whose
    // status is 'attempted' are also preserved (we only upgrade from empty /
    // 'untouched'); callers who want to flip 'attempted' → 'accepted' must
    // go through Phase 4's solve-time writer.
    const existingStatus = fm['lc-status'];
    const existingIsEmpty = typeof existingStatus !== 'string'
      || existingStatus === ''
      || existingStatus === 'untouched';
    if (existingIsEmpty) {
      fm['lc-status'] = input.initialStatus ?? 'untouched';
    }
    // else: keep existing ('accepted' or 'attempted') — never downgrade.
    fm['lc-language'] = input.language;

    // 2. tags — union-merge (D-10). Plugin's current-pass set + existing tags, deduped.
    const priorTags = Array.isArray(fm.tags)
      ? (fm.tags as unknown[]).filter((t): t is string => typeof t === 'string')
      : [];
    const mergedTags = Array.from(new Set<string>([...priorTags, ...input.pluginTags]));
    fm.tags = mergedTags;

    // 3. Non-lc-* user keys (incl. aliases): untouched. The callback does not
    //    mutate anything else on fm; Obsidian preserves them verbatim.
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 4 Plan 03 — solve-time frontmatter writer (GRAPH-02, D-10, D-11, D-20)
// ─────────────────────────────────────────────────────────────────────────
//
// On an Accepted submission, KnowledgeGraphWriter.onAccepted flips three
// lc-* frontmatter fields (lc-status='accepted', lc-solved-date ISO-8601,
// lc-language) and union-merges `lc/{topic-slug}` tags (D-11). The historical
// runtime/memory keys were dropped in Phase 5.3 D-01/D-02 because no production
// reader consumed them — display reads runtime/memory fresh from LC GraphQL.
// `applyFrontmatter` above drives the open/refresh path; this solve-time
// variant is intentionally separate because:
//   - It writes THREE lc-* keys, not seven (aliases + problem-identity fields
//     are already persisted on note creation).
//   - It has a non-downgrade contract in the OPPOSITE direction from D-04:
//     here we ALWAYS upgrade to 'accepted', never preserve an existing
//     'attempted' status.
//   - On every AC, the writer flips status + date + language regardless of
//     network-side display lookups (T-04-03-01 threat mitigation).
//
// Purity contract: same as applyFrontmatter — all mutations happen INSIDE
// the processFrontMatter callback. `solvedAt` is captured by the caller
// (KnowledgeGraphWriter) so the helper is safe to retry.
//
// Tag union-merge: any `lc/{topic-slug}` tag present on disk is preserved.
// Plugin-contributed tags are `currentPassTags` (the solve-time union of
// problem-detail topicSlugs + any other tags the caller wants to contribute).
// Non-lc tags ('revisit', 'todo-review', etc.) are preserved.

/** Input for the solve-time frontmatter writer.
 *
 * Phase 5.3 D-01/D-02: solve-time runtime + memory inputs removed.
 * UAT 2026-05-13: solve-time `solvedAt` input removed alongside the
 * `lc-solved-date` write — the field had no production reader (the
 * Submissions modal reads `submittedAt` fresh from LC GraphQL) and
 * stayed silently stale on re-AC. Narrowed frontmatter surface. */
export interface SolveTimeFrontmatterInput {
  /** LC langSlug the submission used (python3, java, cpp, …). */
  language: string;
  /** Plugin-derived tags to union into the frontmatter's tags array — e.g.
   *  ['lc/hash-table', 'lc/array']. Caller maps topic slugs → `lc/{slug}`. */
  currentPassTags: string[];
}

/**
 * Solve-time frontmatter writer (GRAPH-02, Phase 2 D-05 carry).
 *
 * Called from KnowledgeGraphWriter.onAccepted step 1 (D-09). Semantics:
 *
 *   lc-status: 'accepted' — overwrites any existing status including
 *              'accepted' itself (re-AC case; D-24 keeps frontmatter reflective
 *              of the latest submission).
 *   lc-language — overwrites with the submission's language (D-24: reflect
 *                 latest, not best; the user may have switched languages).
 *   tags — union-merge input.currentPassTags with existing tags. Preserves
 *          user tags ('revisit') and existing `lc/{slug}` tags.
 *
 * Phase 5.3 D-01/D-02: legacy runtime/memory frontmatter writes deleted —
 * those keys were write-only and never read by display code (which uses
 * fresh GraphQL via `SubmissionDetailModal.runtimeDisplay`). Removing the
 * writes eliminates stale-data risk and narrows the frontmatter surface.
 *
 * UAT 2026-05-13: `lc-solved-date` write deleted for the same reason —
 * no production reader; staleness risk on re-AC. The Past-Submissions
 * modal renders `submittedAt` from fresh GraphQL.
 *
 * Non-lc-* user keys: untouched.
 */
export async function applySolveTimeFrontmatter(
  app: App,
  file: TFile,
  input: SolveTimeFrontmatterInput,
): Promise<void> {
  await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
    // Status — always 'accepted' on AC. D-24: re-AC still fires this.
    fm['lc-status'] = 'accepted';
    // Language — overwrites (D-24).
    fm['lc-language'] = input.language;

    // Tags union-merge. Phase 2 D-10 semantics: preserve existing + add
    // plugin-contributed. Dedup via Set.
    const priorTags = Array.isArray(fm.tags)
      ? (fm.tags as unknown[]).filter((t): t is string => typeof t === 'string')
      : [];
    const merged = Array.from(new Set<string>([...priorTags, ...input.currentPassTags]));
    fm.tags = merged;
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 4 Plan 02 extensions (GRAPH-03, GRAPH-04, D-12, D-16, D-17)
// ─────────────────────────────────────────────────────────────────────────
//
// All three helpers are pure string builders with ZERO new imports:
//  - buildTechniquesBlock → `## Techniques` body content (D-12)
//  - buildTechniqueStubBody → frontmatter-only stub note body (D-16)
//  - buildTechniqueFilename → vault-safe filename (D-17)
//
// SSoT invariant preserved: heading literals come from TECHNIQUES_HEADING_LINE;
// no other module hardcodes `## Techniques`.

/**
 * Emits the plugin's canonical `## Techniques` block body (D-12). Format:
 *   "## Techniques\n\n- [[Name1]]\n- [[Name2]]\n..."
 *
 * Ordering follows LC's natural `topicTags` order (D-12) — caller passes the
 * tags in the desired order (no sort here). Empty tag array returns just the
 * heading + blank line (callers should skip the write when topicTags is empty
 * per D-25; see KnowledgeGraphWriter Plan 03 guard).
 */
export function buildTechniquesBlock(
  topicTags: ReadonlyArray<{ name: string }>,
): string {
  const bullets = topicTags.map((t) => `- [[${t.name}]]`).join('\n');
  return `${TECHNIQUES_HEADING_LINE}\n\n${bullets}`;
}

/**
 * Emits the frontmatter-only stub technique note body (D-16). Exactly three
 * frontmatter fields, empty body after the closing fence:
 *   ---
 *   lc-technique: <slug>
 *   aliases:
 *     - <name>
 *   tags:
 *     - lc/technique/<slug>
 *   ---
 *   <empty body — cursor lands here when user opens the note>
 *
 * Caller is responsible for never-overwrite discipline (D-18) — see
 * StubNoteCreator.createStubIfMissing in src/graph/StubNoteCreator.ts.
 */
export function buildTechniqueStubBody(slug: string, name: string): string {
  return `---\nlc-technique: ${slug}\naliases:\n  - ${name}\ntags:\n  - lc/technique/${slug}\n---\n\n`;
}

/**
 * Normalize a LC topic-tag name into a vault-safe filename (D-17).
 * Replaces vault-forbidden chars (`/`, `\\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`)
 * with `-`. Preserves `+` for the C++ case (RESEARCH §A1 — filesystem-legal
 * on all target OSes). Appends the `.md` extension. Does NOT path-join —
 * caller provides the folder.
 *
 * Defensive posture: LC's real topic-tag names are alphanumeric + spaces +
 * hyphens in practice (checked against live LC 2026-05), but this helper
 * protects against future drift and against malicious `name` values that
 * could trigger path-traversal (T-04-02-01 — e.g. `'../evil'` collapses to
 * `'-.-.-evil.md'` which stays inside the Techniques folder).
 */
export function buildTechniqueFilename(name: string): string {
  const safe = name.replace(/[/\\:*?"<>|]/g, '-');
  return `${safe}.md`;
}
