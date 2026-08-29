// src/settings/SettingsStore.ts
// Async wrapper over plugin.loadData() / plugin.saveData().
// All feature code reads/writes data.json through this class.
// Cookies NEVER leave data.json (CF-03, AUTH-06).
import type { Plugin } from 'obsidian';
import type { AuthCookies } from '../auth/types';
import type { IndexedProblem, ProblemIndex } from '../browse/types';
import { logger } from '../shared/logger';

export type { AuthCookies } from '../auth/types';

// CF-03 compliance: contentHtml is LC public problem content — non-sensitive. Only
// auth.LEETCODE_SESSION (a sibling in PluginData) is a secret; logger.ts redaction
// patterns target that field. contentHtml is safely persisted in data.json without redaction.
/** Per-problem detail cache entry persisted in data.json.
 *  Schema locked by CONTEXT.md D-14. Keyed by slug inside PluginData.problemDetails.
 *  ~10–50 KB per entry; 7-day TTL enforced by callers (NoteWriter.CACHE_TTL_MS). */
export interface DetailCacheEntry {
  fetchedAt: number;
  id: number;
  title: string;
  /** cn localized title (from `translatedTitle` in cn GraphQL). Callers fall
   *  back to `title` when absent. Optional for backward-compat with entries
   *  written before this field existed. */
  titleCn?: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  url: string;
  contentHtml: string;
  topicSlugs: string[];
  exampleTestcases?: string;
  /** Phase 5.4 D-08 — JSON-serialized metaData blob from LC GraphQL.
   *  Used to derive arity (lines per case) and label input rows in the
   *  verdict modal. Optional: pre-5.4 cache entries are still valid. */
  metaData?: string;
  /** Phase 5.4 — first sample case (newline-separated values, one per line).
   *  Used as fallback arity source when metaData is malformed. */
  sampleTestCase?: string;
  codeSnippets?: Array<{ lang: string; langSlug: string; code: string }>;
  /** Phase 3 D-30 — LC's internal `questionId` (distinct from `questionFrontendId`
   *  for some problems, e.g., premium variants). Used as the `question_id` REST
   *  body field by Plan 04's leetcodeRest.ts. Optional: Phase 2 cache entries
   *  written before this field existed remain valid. */
  internalQuestionId?: string;
  /** Phase 4 D-12 — LC topic-tag display names + slugs cached alongside the
   *  existing topicSlugs. Used by KnowledgeGraphWriter (Plan 03) to build
   *  `[[Name]]` wikilinks in the ## Techniques section and to create stub
   *  technique notes (GRAPH-03, GRAPH-04). Optional for backward-compat with
   *  Phase 2-era cache entries (Pitfall 10): undefined = pre-Phase-4 entry;
   *  KnowledgeGraphWriter skips the ## Techniques write when absent.
   *  cn-only: `translatedName` is the Chinese topic label (e.g. 动态规划),
   *  auto-filling the 分类 frontmatter property at note creation. Undefined
   *  on .com entries and pre-cn cache entries — callers fall back to `name`. */
  topicTags?: Array<{ name: string; slug: string; translatedName?: string | null }>;
}
export type LeetCodeRegion = 'com' | 'cn';

const VALID_REGIONS: ReadonlySet<LeetCodeRegion> = new Set<LeetCodeRegion>(['com', 'cn']);

export interface PluginData {
  version: 1;
  /** Ticket #1 — per-vault LeetCode region. 'cn' = leetcode.cn (default for
   *  the cn fork); 'com' = leetcode.com (seam for future use). Shape-guard
   *  collapses anything that isn't literally 'com' or 'cn' to 'cn'. */
  region: LeetCodeRegion;
  auth: AuthCookies | null;
  username: string | null;
  /** Whether the signed-in user has LC Premium. Set by AuthService from
   *  fetchWhoami; informational (null → unknown, treat as non-premium). */
  isPremium: boolean | null;
  problemsFolder: string;  // D-10: default 'LeetCode' (stored without trailing slash)
  defaultLanguage: string; // D-10: default 'python3' (LC's Python slug)
  problemIndex: ProblemIndex | null;
  /** Compound filter rules from the filter modal. Null = no filter active.
   *  Persisted so filter survives plugin reload / Obsidian restart. */
  filter: CompoundFilter | null;
  /** Per-slug problem-detail cache. Populated on first problem open; refreshed
   *  by NoteWriter on re-open after a 7-day TTL. Malformed entries dropped at
   *  load time. D-14. */
  problemDetails: Record<string, DetailCacheEntry>;
  /** Ticket #5 — user-configurable note template. Empty string = use built-in
   *  default. Stored as-is; renderTemplate replaces {{placeholders}} at note
   *  creation time. */
  noteTemplate: string;
  /** User-defined tail block appended to every new problem note after the
   *  template body. Rendered with the same placeholders (e.g. {{language}}),
   *  so a dataview review block can key off the language tag. Empty = none. */
  noteFooter: string;
  /** Ticket #02 — download cn CDN images to vault. Default OFF. When ON,
   *  images from leetcode.cn CDN are downloaded to imageFolder and links
   *  rewritten to local vault paths. */
  downloadImages: boolean;
  /** Ticket #02 — vault folder for downloaded LC images. Default `附件/leetcode`. */
  imageFolder: string;
  /** Ticket #03 — user-defined custom placeholders. Key = placeholder name
   *  (snake_case), value = template string (may reference built-in placeholders). */
  customPlaceholders: Record<string, string>;
}

// NOTE on removed fields: the cn fork's workflow A deleted the upstream's
// widget / AI / contest / preview features. Their data.json fields
// (indentSizeOverride, showRelativeLineNumbers, autoMigrateOnOpen,
// widgetSyncDebounceMs, autoBacklinksEnabled, techniquesFolderOverride,
// previewClickBehavior, activeAIProvider, providerConfigs, aiCostLedger,
// autoAIReviewOnAC, contestSession, autoAIContestAnalysis, contestIndex,
// autoAIKnowledgeGraph, featureFlags, legacyBaseNoticeShown) are now
// read-and-ignore: load() never hydrates them, so the next persist() writes
// the canonical shape and they disappear from disk naturally.

/** Compound filter matching LC's "Match All/Any of the following" UI. Each
 *  rule targets a single field with an operator; the top-level `match` field
 *  decides AND vs OR across rules. */
export interface CompoundFilter {
  match: 'all' | 'any';
  rules: FilterRule[];
}

export type FilterRule =
  | { field: 'status'; op: 'is' | 'is-not'; values: string[] }
  | { field: 'difficulty'; op: 'is' | 'is-not'; values: string[] }
  | { field: 'topics'; op: 'is' | 'is-not'; values: string[] }
  | { field: 'question-id'; op: 'range'; min: number | null; max: number | null }
  | { field: 'acceptance'; op: 'range'; min: number | null; max: number | null }
  // Phase 5.2 D-03 — premium becomes multi-value (values: string[]) mirroring
  // the status/difficulty/topics shape. Legal entries in values are 'premium'
  // and 'non-premium'; values=[] is a no-op in the evaluator.
  | { field: 'premium'; op: 'is'; values: string[] };

const DEFAULT_DATA: PluginData = {
  version: 1,
  region: 'cn',
  auth: null,
  username: null,
  isPremium: null,
  problemsFolder: 'LeetCode',
  defaultLanguage: 'java',
  problemIndex: null,
  filter: null,
  problemDetails: {},
  noteTemplate: '',  // '' = use built-in DEFAULT_TEMPLATE
  // User-defined tail block appended to every new problem note (rendered with
  // the same placeholders as the template — e.g. a dataview review table).
  // '' = append nothing. Exists so per-note extras are user-owned instead of
  // hardcoded in DEFAULT_TEMPLATE.
  noteFooter: '',
  downloadImages: false,
  imageFolder: '附件/leetcode',
  customPlaceholders: {},
};

const VALID_DIFFICULTIES = new Set(['Easy', 'Medium', 'Hard']);
const VALID_STATUSES = new Set(['solved', 'attempted', 'untouched']);

/** Shape-guard for AuthCookies; rejects non-string fields that would flow into
 *  Credential.init() as non-strings and silently fail all subsequent API calls. */
function isValidAuthCookies(v: unknown): v is AuthCookies {
  if (v === null || typeof v !== 'object') return false;
  const a = v as Partial<AuthCookies>;
  return typeof a.LEETCODE_SESSION === 'string' && typeof a.csrftoken === 'string';
}

/** Strip trailing slashes; reject path-traversal segments and absolute paths so a
 *  corrupt/malicious data.json can't steer vault writes outside the configured folder.
 *  Returns the default value if input is unsafe. */
function sanitizeFolder(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_DATA.problemsFolder;
  const trimmed = raw.trim();
  if (!trimmed) return DEFAULT_DATA.problemsFolder;
  // Reject absolute paths (Unix + Windows).
  if (trimmed.startsWith('/') || trimmed.startsWith('\\')) return DEFAULT_DATA.problemsFolder;
  // Reject any `..` segment anywhere in the path.
  const segments = trimmed.split(/[\\/]+/);
  if (segments.some((s) => s === '..')) return DEFAULT_DATA.problemsFolder;
  return trimmed.replace(/[\\/]+$/, '');
}

/** Shape-guard for a single IndexedProblem row. WR-04: if any row is missing a
 *  required field (especially `diff`), ProblemBrowserView.renderRow crashes on
 *  p.diff.toLowerCase() — so we force a clean re-fetch rather than load partial data. */
function isValidIndexedProblem(v: unknown): v is IndexedProblem {
  if (!v || typeof v !== 'object') return false;
  const p = v as Partial<IndexedProblem>;
  return (
    typeof p.id === 'number' &&
    typeof p.slug === 'string' &&
    typeof p.title === 'string' &&
    (p.titleCn === undefined || typeof p.titleCn === 'string') &&
    (p.frontendId === undefined || typeof p.frontendId === 'string') &&
    typeof p.diff === 'string' && VALID_DIFFICULTIES.has(p.diff) &&
    typeof p.paid === 'boolean' &&
    (p.status === undefined || (typeof p.status === 'string' && VALID_STATUSES.has(p.status))) &&
    (p.acRate === undefined || (typeof p.acRate === 'number' && p.acRate >= 0 && p.acRate <= 100)) &&
    (p.topics === undefined ||
      (Array.isArray(p.topics) && p.topics.every((t) => typeof t === 'string')))
  );
}

function isValidProblemIndex(v: unknown): v is ProblemIndex {
  if (!v || typeof v !== 'object') return false;
  const idx = v as Partial<ProblemIndex>;
  if (typeof idx.fetchedAt !== 'number' || !Array.isArray(idx.problems)) return false;
  // Region tag optional (legacy caches) but must be a known region when present;
  // a mismatch is handled by ProblemListService (treated as stale, re-fetched).
  if (idx.region !== undefined && idx.region !== 'cn' && idx.region !== 'com') return false;
  return idx.problems.every(isValidIndexedProblem);
}

/** Per-rule shape-guard. Accepts only recognized field names with valid op +
 *  value shape. Unknown field values (e.g. legacy `language`) return false so
 *  `sanitizeCompoundFilter` drops them (D-02 graceful degradation).
 *
 *  NOTE: Extra properties on rule objects (e.g. the `__autoDefault` marker the
 *  first-open default carries) are IGNORED — the guard validates only the
 *  fields it knows about. This lets the marker round-trip through data.json
 *  without tripping validation (D-04 design). */
function isValidFilterRule(r: unknown): r is FilterRule {
  if (!r || typeof r !== 'object') return false;
  const rule = r as Record<string, unknown>;
  if (typeof rule.field !== 'string') return false;
  const multiValueFields = new Set(['status', 'difficulty', 'topics']);
  const rangeFields = new Set(['question-id', 'acceptance']);
  if (multiValueFields.has(rule.field)) {
    return (rule.op === 'is' || rule.op === 'is-not') &&
      Array.isArray(rule.values) &&
      rule.values.every((x) => typeof x === 'string');
  }
  if (rangeFields.has(rule.field)) {
    return rule.op === 'range' &&
      (rule.min === null || typeof rule.min === 'number') &&
      (rule.max === null || typeof rule.max === 'number');
  }
  if (rule.field === 'premium') {
    // D-03 multi-value — values is an array of 'premium' / 'non-premium'.
    return rule.op === 'is' &&
      Array.isArray(rule.values) &&
      rule.values.every((x) => x === 'premium' || x === 'non-premium');
  }
  // Unknown field (e.g. legacy `language`) — reject so sanitize drops silently.
  return false;
}

/** Permissive shell — only validates the container (match + rules array).
 *  Per-rule validity is applied later by `sanitizeCompoundFilter` so malformed
 *  or legacy rules (e.g. `language`) are silently dropped rather than causing
 *  the entire filter to be discarded. */
function isValidCompoundFilter(v: unknown): v is CompoundFilter {
  if (!v || typeof v !== 'object') return false;
  const f = v as Partial<CompoundFilter>;
  if (f.match !== 'all' && f.match !== 'any') return false;
  if (!Array.isArray(f.rules)) return false;
  return true;
}

/** Filter the rules array down to valid FilterRules; unknown-field rules
 *  (e.g. legacy `language`) are dropped silently. Empty result after sanitize
 *  is fine — the downstream pipeline treats `{match, rules: []}` as no-filter. */
function sanitizeCompoundFilter(f: CompoundFilter): CompoundFilter {
  return { match: f.match, rules: f.rules.filter(isValidFilterRule) };
}

/** Shape-guard for a single DetailCacheEntry; same posture as isValidIndexedProblem. */
function isValidDetailCacheEntry(v: unknown): v is DetailCacheEntry {
  if (!v || typeof v !== 'object') return false;
  const d = v as Partial<DetailCacheEntry>;
  if (typeof d.fetchedAt !== 'number') return false;
  if (typeof d.id !== 'number') return false;
  if (typeof d.title !== 'string') return false;
  if (typeof d.difficulty !== 'string' || !VALID_DIFFICULTIES.has(d.difficulty)) return false;
  if (typeof d.url !== 'string') return false;
  if (typeof d.contentHtml !== 'string') return false;
  if (!Array.isArray(d.topicSlugs) || !d.topicSlugs.every((s) => typeof s === 'string')) return false;
  if (d.exampleTestcases !== undefined && typeof d.exampleTestcases !== 'string') return false;
  if (d.metaData !== undefined && typeof d.metaData !== 'string') return false;
  if (d.sampleTestCase !== undefined && typeof d.sampleTestCase !== 'string') return false;
  if (d.codeSnippets !== undefined) {
    if (!Array.isArray(d.codeSnippets)) return false;
    if (!d.codeSnippets.every((c) =>
      c && typeof c === 'object' &&
      typeof (c as { lang?: unknown }).lang === 'string' &&
      typeof (c as { langSlug?: unknown }).langSlug === 'string' &&
      typeof (c as { code?: unknown }).code === 'string'
    )) return false;
  }
  // Phase 3 D-30 — internalQuestionId optional string. Old entries without
  // the field remain valid (Phase 2 backward compat); malformed non-string
  // rejects the whole entry (T-03-03-03 threat mitigation).
  if (d.internalQuestionId !== undefined && typeof d.internalQuestionId !== 'string') return false;
  // Ticket #01 tracer-bullet — titleCn optional string. Old entries without
  // the field remain valid; malformed non-string rejects the whole entry
  // (same threat-mitigation posture as internalQuestionId above).
  if (d.titleCn !== undefined && typeof d.titleCn !== 'string') return false;
  // Phase 4 D-12 + Pitfall 10 — topicTags optional array of {name, slug}
  // pairs. Old Phase 2 cache entries without the field remain valid (undefined
  // is accepted); malformed entries (non-array, or array elements missing
  // name/slug string fields) REJECT the whole entry so a fresh fetch
  // repopulates a clean shape (T-04-02-03 threat mitigation).
  if (d.topicTags !== undefined) {
    if (!Array.isArray(d.topicTags)) return false;
    const allValid = d.topicTags.every((t) => {
      if (!t || typeof t !== 'object') return false;
      const rec = t as { name?: unknown; slug?: unknown };
      return typeof rec.name === 'string' && typeof rec.slug === 'string';
    });
    if (!allValid) return false;
  }
  return true;
}

/** Filter incoming problemDetails down to valid entries; drop the rest. */
function sanitizeProblemDetails(raw: unknown): Record<string, DetailCacheEntry> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, DetailCacheEntry> = {};
  for (const [slug, entry] of Object.entries(raw)) {
    if (typeof slug === 'string' && slug.length > 0 && isValidDetailCacheEntry(entry)) {
      out[slug] = entry;
    }
  }
  return out;
}

export class SettingsStore {
  private constructor(private plugin: Plugin, private data: PluginData) {}

  static async load(plugin: Plugin): Promise<SettingsStore> {
    // Treat data.json as untrusted — anyone (or a broken prior version) could
    // have written it. Validate every field before accepting it into PluginData
    // (CR-02). Falls back to DEFAULT_DATA per-field on validation failure.
    const rawUnknown: unknown = (await plugin.loadData()) ?? {};
    const raw = (rawUnknown && typeof rawUnknown === 'object')
      ? (rawUnknown as Record<string, unknown>)
      : {};
    const data: PluginData = {
      version: 1,
      region: (typeof raw.region === 'string' && VALID_REGIONS.has(raw.region as LeetCodeRegion))
        ? (raw.region as LeetCodeRegion)
        : DEFAULT_DATA.region,
      auth: isValidAuthCookies(raw.auth) ? raw.auth : DEFAULT_DATA.auth,
      username: typeof raw.username === 'string' ? raw.username : DEFAULT_DATA.username,
      isPremium: typeof raw.isPremium === 'boolean' ? raw.isPremium : DEFAULT_DATA.isPremium,
      problemsFolder: sanitizeFolder(raw.problemsFolder),
      defaultLanguage: (typeof raw.defaultLanguage === 'string' && raw.defaultLanguage.trim())
        ? raw.defaultLanguage
        : DEFAULT_DATA.defaultLanguage,
      problemIndex: isValidProblemIndex(raw.problemIndex) ? raw.problemIndex : DEFAULT_DATA.problemIndex,
      filter: isValidCompoundFilter(raw.filter)
        ? sanitizeCompoundFilter(raw.filter)
        : DEFAULT_DATA.filter,
      problemDetails: sanitizeProblemDetails(raw.problemDetails),
      noteTemplate: typeof raw.noteTemplate === 'string' && raw.noteTemplate.length > 0
        ? raw.noteTemplate
        : DEFAULT_DATA.noteTemplate,
      noteFooter: typeof raw.noteFooter === 'string'
        ? raw.noteFooter
        : DEFAULT_DATA.noteFooter,
      downloadImages: typeof raw.downloadImages === 'boolean'
        ? raw.downloadImages
        : DEFAULT_DATA.downloadImages,
      imageFolder: typeof raw.imageFolder === 'string' && raw.imageFolder.trim().length > 0
        ? raw.imageFolder.trim().replace(/[\\/]+$/, '')
        : DEFAULT_DATA.imageFolder,
      customPlaceholders: (typeof raw.customPlaceholders === 'object'
        && raw.customPlaceholders !== null
        && !Array.isArray(raw.customPlaceholders)
        && Object.entries(raw.customPlaceholders as Record<string, unknown>).every(
          ([k, v]) => typeof k === 'string' && k.length > 0 && typeof v === 'string'
        ))
        ? raw.customPlaceholders as Record<string, string>
        : DEFAULT_DATA.customPlaceholders,
    };
    // Warn without leaking values so a user whose disk file is corrupt knows
    // why they unexpectedly see a logged-out state or a fresh index refetch.
    if (raw.auth !== undefined && raw.auth !== null && !isValidAuthCookies(raw.auth)) {
      logger.warn('settings.load: ignoring malformed auth; reverting to logged-out state');
    }
    if (raw.problemIndex !== undefined && raw.problemIndex !== null && !isValidProblemIndex(raw.problemIndex)) {
      logger.warn('settings.load: ignoring malformed problemIndex; will re-fetch');
    }
    if (typeof raw.problemsFolder === 'string' && raw.problemsFolder.trim() &&
        sanitizeFolder(raw.problemsFolder) === DEFAULT_DATA.problemsFolder &&
        raw.problemsFolder.trim().replace(/[\\/]+$/, '') !== DEFAULT_DATA.problemsFolder) {
      logger.warn('settings.load: rejected unsafe problemsFolder; reverted to default');
    }
    if (raw.problemDetails !== undefined && raw.problemDetails !== null) {
      const rawMap = raw.problemDetails;
      const inputKeys = rawMap && typeof rawMap === 'object' ? Object.keys(rawMap).length : 0;
      const keptKeys = Object.keys(data.problemDetails).length;
      if (inputKeys !== keptKeys) {
        logger.warn(`settings.load: dropped ${inputKeys - keptKeys} malformed problemDetails entries`);
      }
    }
    return new SettingsStore(plugin, data);
  }

  getAuthCookies(): AuthCookies | null { return this.data.auth; }
  async setAuthCookies(c: AuthCookies | null): Promise<void> {
    this.data.auth = c;
    await this.persist();
  }

  /** Ticket #1 — read the per-vault LeetCode region. */
  getRegion(): LeetCodeRegion { return this.data.region; }

  /** Ticket #1 — persist the per-vault LeetCode region. */
  async setRegion(r: LeetCodeRegion): Promise<void> {
    this.data.region = r;
    await this.persist();
  }

  /** Ticket #1 — region-aware base URL (no trailing slash). */
  getBaseUrl(): string {
    return this.data.region === 'com'
      ? 'https://leetcode.com'
      : 'https://leetcode.cn';
  }

  /** Ticket #1 — region-aware login page URL. */
  getLoginUrl(): string {
    return `${this.getBaseUrl()}/accounts/login/`;
  }

  /** Ticket #1 — region-aware problem detail URL. */
  getProblemUrl(slug: string): string {
    return `${this.getBaseUrl()}/problems/${slug}/`;
  }

  getProblemsFolder(): string { return this.data.problemsFolder; }
  async setProblemsFolder(v: string): Promise<void> {
    this.data.problemsFolder = v;
    await this.persist();
  }

  getDefaultLanguage(): string { return this.data.defaultLanguage; }
  async setDefaultLanguage(v: string): Promise<void> {
    this.data.defaultLanguage = v;
    await this.persist();
  }

  getProblemIndex(): ProblemIndex | null { return this.data.problemIndex; }
  async setProblemIndex(i: ProblemIndex): Promise<void> {
    this.data.problemIndex = i;
    await this.persist();
  }

  getUsername(): string | null { return this.data.username; }
  async setUsername(u: string | null): Promise<void> {
    this.data.username = u;
    await this.persist();
  }

  getIsPremium(): boolean | null { return this.data.isPremium; }
  async setIsPremium(v: boolean | null): Promise<void> {
    this.data.isPremium = v;
    await this.persist();
  }

  getFilter(): CompoundFilter | null { return this.data.filter; }
  async setFilter(f: CompoundFilter | null): Promise<void> {
    this.data.filter = f;
    await this.persist();
  }

  /** Ticket #5 — read the user's note template. Empty = use built-in default. */
  getNoteTemplate(): string { return this.data.noteTemplate; }

  // === Ticket #02 — image localization ===

  getDownloadImages(): boolean { return this.data.downloadImages; }

  async setDownloadImages(v: boolean): Promise<void> {
    this.data.downloadImages = v;
    await this.persist();
  }

  getImageFolder(): string { return this.data.imageFolder; }

  async setImageFolder(v: string): Promise<void> {
    this.data.imageFolder = v.trim().replace(/[\\/]+$/, '');
    await this.persist();
  }

  // === Ticket #03 — custom placeholders ===

  getCustomPlaceholders(): Record<string, string> { return { ...this.data.customPlaceholders }; }

  async setCustomPlaceholder(name: string, value: string): Promise<void> {
    this.data.customPlaceholders = { ...this.data.customPlaceholders, [name]: value };
    await this.persist();
  }

  async removeCustomPlaceholder(name: string): Promise<void> {
    const next = { ...this.data.customPlaceholders };
    delete next[name];
    this.data.customPlaceholders = next;
    await this.persist();
  }

  /** Ticket #5 — persist the user's note template. */
  async setNoteTemplate(v: string): Promise<void> {
    this.data.noteTemplate = v;
    await this.persist();
  }

  /** Tail block appended to every new problem note (placeholder-rendered). */
  getNoteFooter(): string { return this.data.noteFooter; }

  async setNoteFooter(v: string): Promise<void> {
    this.data.noteFooter = v;
    await this.persist();
  }

  /** Read the cached detail for a slug. D-15. Returns null if missing. */
  getProblemDetail(slug: string): DetailCacheEntry | null {
    return this.data.problemDetails[slug] ?? null;
  }

  /** Persist a detail cache entry. D-15. Mutates in place + persists. */
  async setProblemDetail(slug: string, detail: DetailCacheEntry): Promise<void> {
    this.data.problemDetails[slug] = detail;
    await this.persist();
  }

  private async persist(): Promise<void> {
    await this.plugin.saveData(this.data);
  }
}
