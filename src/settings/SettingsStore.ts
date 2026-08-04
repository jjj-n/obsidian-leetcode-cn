// src/settings/SettingsStore.ts
// Async wrapper over plugin.loadData() / plugin.saveData().
// All feature code reads/writes data.json through this class.
// Cookies NEVER leave data.json (CF-03, AUTH-06).
import type { Plugin } from 'obsidian';
import type { AuthCookies } from '../auth/types';
import type { IndexedProblem, ProblemIndex } from '../browse/types';
import { logger } from '../shared/logger';

// Stub types for backward compat — AI provider and contest features were
// removed in the cn fork (workflow A). The fields using these types are
// preserved in PluginData for backward-compatible data.json loading, but
// are not actively used. These stubs will be cleaned up in a future commit.
// Using `any` liberally to avoid cascading type errors at call sites.
export type AIProvider = 'anthropic' | 'openai' | 'openrouter' | 'ollama' | 'custom' | 'bedrock';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ProviderConfig = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BedrockProviderConfig = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AICostLedger = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ContestSession = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ContestIndex = Record<string, any>;

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
   *  KnowledgeGraphWriter skips the ## Techniques write when absent. */
  topicTags?: Array<{ name: string; slug: string }>;
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
  /** Whether the signed-in user has LC Premium. Controls the default-hide-premium
   *  behavior in the filter modal (if null → unknown, treat as non-premium). */
  isPremium: boolean | null;
  problemsFolder: string;  // D-10: default 'LeetCode' (stored without trailing slash)
  defaultLanguage: string; // D-10: default 'python3' (LC's Python slug)
  /** Phase 16 INDENT-04 D-06 — user-visible override for the code-editor
   *  indent unit. `'auto'` defers to the per-language default
   *  (`childEditorLanguage.ts:effectiveIndent`); a numeric literal forces that
   *  many spaces for every language EXCEPT Go, which always uses tab regardless
   *  (gofmt is non-negotiable — exception is enforced by the consumer, not
   *  this field). Strict-equality shape-guard at load: anything that isn't
   *  literally the number 2/4/8 collapses to `'auto'` (string '4', null,
   *  missing field, typo, etc.) — mirrors the `previewClickBehavior`
   *  posture (Phase 06 PREVIEW-02). */
  indentSizeOverride: 'auto' | 2 | 4 | 8;
  showRelativeLineNumbers: boolean;
  /** Phase 19 vq4 — master toggle for the nested CM6 child-editor stack.
   *  Default true (existing-user behavior preserved). When false, onload
   *  skips registerEditorExtension(buildNestedEditorExtension), skips
   *  registerVaultModifyRepairTrigger, and skips the file-open repair hook.
  /** Phase 21 MIGRATE-06 — auto-migrate v1.2 notes on file open. Default true.
   *  When ON, opening a v1.2 LC note silently rewrites the legacy fence opener
   *  to ```leetcode-solve and fills `lc-language` if missing. When OFF, the
   *  widget mount path renders a `legacyFenceBanner` instead with a
   *  [Migrate now] button. Strict-match predicate gates entry — non-LC fences
   *  never touched. Shape-guard at load: non-boolean / missing / corrupt
   *  collapses to true (default ON). */
  autoMigrateOnOpen: boolean;
  /** Phase 19 C-06 — debounced widget writer delay in milliseconds.
   *  Default 400ms. Configurable via Settings → Experimental: 300/400/500/
   *  1000/2000ms (CONTEXT D-08). Strict-equality shape-guard at load:
   *  anything that isn't literally one of those five numbers (string '400',
   *  null, missing field, typo) collapses to 400. Mirrors indentSizeOverride
   *  posture at lines 664-668. Plan 19-02 owns the debouncedWriter; Plan
   *  19-01 only ships the persistence + UI wire-up. */
  widgetSyncDebounceMs: 300 | 400 | 500 | 1000 | 2000;
  problemIndex: ProblemIndex | null;
  /** Compound filter rules from the filter modal. Null = no filter active.
   *  Persisted so filter survives plugin reload / Obsidian restart. */
  filter: CompoundFilter | null;
  /** Per-slug problem-detail cache. Populated on first problem open; refreshed
   *  by NoteWriter on re-open after a 7-day TTL. Malformed entries dropped at
   *  load time. D-14. */
  problemDetails: Record<string, DetailCacheEntry>;
  /** GAP-6 migration flag: set to true after the one-time "your LeetCode.base
   *  may need to be regenerated" Notice fires, so subsequent plugin loads do
   *  not spam the user. Checked against the v0.1.0 broken signature in
   *  src/notes/BaseFile.ts. */
  legacyBaseNoticeShown: boolean;
  /** Phase 4 GRAPH-05, D-21 — master toggle for on-AC auto-backlink creation.
   *  When false, KnowledgeGraphWriter.onAccepted still writes the 5 lc-* solve
   *  frontmatter fields (D-10) and the `lc/{topic-slug}` frontmatter tags
   *  (D-20 opt-out scope), but skips the ## Techniques body write + stub note
   *  creation. Default true (D-21: the headline plugin value is "notes become
   *  a graph"; off-by-default hides the differentiator). Settings UI control
   *  ships in Phase 5 POLISH-01; Phase 4 only ships the persistence field. */
  autoBacklinksEnabled: boolean;
  /** Phase 5 POLISH-01 D-15 — user-visible override for the technique folder.
   *  Empty string '' means "use the derived default"
   *  (`{problemsFolder}/Techniques`), preserving Phase 4 behavior for users
   *  who never touch this setting. A non-empty value takes precedence
   *  verbatim. Shape-guard coerces non-string raw data.json values to ''
   *  (T-05-02-01 mitigation). UI layer trims trailing slashes before set;
   *  setter accepts raw. */
  techniquesFolderOverride: string;
  /** Phase 07 AIPROV-01 — currently-active AI provider, null when no
   *  provider is selected. Switching this value preserves all prior
   *  providers' apiKey/baseUrl/model/disclosureAcknowledged via the
   *  per-provider `providerConfigs` map below (T-07-01 invariant). */
  activeAIProvider: AIProvider | null;
  /** Phase 07 AIPROV-01 — per-provider credential + endpoint config, keyed by
   *  AIProvider. All 6 entries always present after `SettingsStore.load`
   *  (fresh installs and corrupt-data recovery alike). Each entry has the
   *  Vercel-AI-SDK-shape required fields apiKey/baseUrl/model and the
   *  disclosure boolean (D-A). Shape-guard `sanitizeProviderConfig` at load
   *  collapses every malformed field to its per-provider default.
   *
   *  Phase 08.1 Plan 02 — widened to `ProviderConfig | BedrockProviderConfig`
   *  to accommodate the Bedrock entry's region/modelId/authMethod/secret
   *  fields. The bedrock branch hydrates via `sanitizeBedrockProviderConfig`. */
  providerConfigs: Record<AIProvider, ProviderConfig | BedrockProviderConfig>;
  /** Phase 07 AIPROV-06 + decision F — daily AI spend tally. Day-rollover
   *  happens on read inside `addCostLedger` (when local-day differs from
   *  `date`, ledger resets BEFORE adding). No cap enforcement, no UI in
   *  Phase 07. */
  aiCostLedger: AICostLedger;
  /** Phase 06 PREVIEW-02 — click-default behavior for ProblemBrowserView rows.
   *  'preview' = single-click previews (default for fresh installs and v1.1
   *  upgraders alike — CONTEXT.md decision A; no upgrader-detection branch);
   *  'open' = single-click creates/opens the note (v1.0 behavior). Shift-click
   *  always opens regardless of this setting (CONTEXT.md decision A).
   *  Shape-guard (RESEARCH §Pitfall 7) collapses anything that isn't literally
   *  the string 'open' to 'preview' — fresh install, missing field, wrong
   *  type, typo all fall through to the safe default. */
  previewClickBehavior: 'preview' | 'open';
  /** Phase 09 AIREV-01 — opt-in auto AI review on Accepted. Default false
   *  (user must explicitly enable). Shape-guard collapses non-boolean to
   *  false so corrupt data.json never enables AI calls. */
  autoAIReviewOnAC: boolean;
  /** Phase 10 CONTEST-03 — active contest session state. Null when no contest
   *  is in progress. Shape-guard validates structure at load time; malformed
   *  values collapse to null (no orphan contest state). */
  contestSession: ContestSession | null;
  /** Phase 10 CONTEST-08 — opt-in auto AI contest analysis on contest end.
   *  Default false (user must explicitly enable). Shape-guard collapses
   *  non-boolean to false so corrupt data.json never enables AI calls. */
  autoAIContestAnalysis: boolean;
  /** Phase 10 CONTEST-01 — cached contest index for the sidebar contest list.
   *  Null when never fetched. 24h TTL (same as problemIndex). Shape-guard
   *  validates structure at load; malformed values collapse to null. */
  contestIndex: ContestIndex | null;
  /** Phase 11 AIKG-01 — auto-classify accepted solutions into patterns.
   *  Default true (core KG feature, ON when AI is configured). */
  autoAIKnowledgeGraph: boolean;
  /** Phase 11 AIKG-06 — feature flags for experimental KG behaviors. */
  featureFlags: { lookAheadEdges: boolean };
  /** Ticket #5 — user-configurable note template. Empty string = use built-in
   *  default. Stored as-is; renderTemplate replaces {{placeholders}} at note
   *  creation time. */
  noteTemplate: string;
}

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

/** Phase 07 Plan 01 — per-provider defaults locked by CONTEXT decision C
 *  (D-C). Used by both DEFAULT_DATA and the `sanitizeProviderConfig`
 *  fallback path inside `load`. Iteration order matches the AIProvider
 *  union in src/ai/types.ts.
 *
 *  Phase 08.1 Plan 02 — added `bedrock` entry. Map type widened to
 *  `Record<AIProvider, ProviderConfig | BedrockProviderConfig>` so the
 *  Bedrock entry's region/modelId/authMethod/secret fields fit. The
 *  inherited apiKey/baseUrl/model fields on the bedrock entry are unused
 *  by the bedrock adapter (they exist purely to satisfy the ProviderConfig
 *  base shape). */
const DEFAULT_PROVIDER_CONFIGS: Record<AIProvider, ProviderConfig | BedrockProviderConfig> = {
  anthropic: {
    apiKey: '',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-haiku-4-5',
    disclosureAcknowledged: false,
  },
  openai: {
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5-mini',
    disclosureAcknowledged: false,
  },
  openrouter: {
    apiKey: '',
    baseUrl: 'https://openrouter.ai/api/v1',
    // DOT, not dash — OpenRouter slug for Anthropic Haiku 4.5 (D-C).
    model: 'anthropic/claude-haiku-4.5',
    disclosureAcknowledged: false,
  },
  ollama: {
    apiKey: '',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.2',
    disclosureAcknowledged: false,
  },
  custom: {
    apiKey: '',
    baseUrl: '',
    model: '',
    disclosureAcknowledged: false,
  },
  // Phase 08.1 Plan 02 — Bedrock defaults locked per CONTEXT decision B +
  // 08.1-PATTERNS.md "Plan 08.1-02 #src/settings/SettingsStore.ts".
  // apiKey/baseUrl/model are unused by the Bedrock adapter — region/modelId
  // take their place. All 4 secret fields default to '' so switching auth
  // methods later starts from a clean slate (Pitfall 10 — preserve invariant
  // applies AFTER the user has typed a value; defaults stay empty).
  bedrock: {
    apiKey: '',
    baseUrl: '',
    model: '',
    disclosureAcknowledged: false,
    region: 'us-east-1',
    modelId: 'us.anthropic.claude-sonnet-4-6',
    authMethod: 'default-chain',
    accessKeyId: '',
    secretAccessKey: '',
    ssoProfile: '',
    bedrockApiKey: '',
    sessionToken: '',
  },
};

const DEFAULT_DATA: PluginData = {
  version: 1,
  region: 'cn',
  auth: null,
  username: null,
  isPremium: null,
  problemsFolder: 'LeetCode',
  defaultLanguage: 'python3',
  // Phase 16 INDENT-04 D-06 — 'auto' = per-language default applies. Go
  // always uses '\t' regardless of override (gofmt non-negotiable);
  // exception is enforced by the consumer (childEditorLanguage.ts).
  indentSizeOverride: 'auto',
  showRelativeLineNumbers: false,
  // Phase 21 MIGRATE-06 — default ON; user must explicitly opt out.
  // Phase 22 (D-settings-01) — `useInlineWidget` / `useNestedEditor` master
  // gates retired with the v1.2 path. The v1.3 widget is the only mount path,
  // and migration runs unconditionally on file open.
  autoMigrateOnOpen: true,
  // Phase 19 C-06 — default 400ms debounced writer delay (Plan 19-02 wires it).
  widgetSyncDebounceMs: 400,
  problemIndex: null,
  filter: null,
  problemDetails: {},
  legacyBaseNoticeShown: false,
  autoBacklinksEnabled: true,  // D-21 default ON
  techniquesFolderOverride: '',  // D-15 '' = use derived default
  // CONTEXT.md decision A — single default for fresh installs and v1.1 upgraders.
  previewClickBehavior: 'preview',
  // Phase 07 Plan 01 — AI defaults. activeAIProvider is null until the user
  // picks one in the Settings tab; providerConfigs holds all 5 defaults so
  // switching providers never loses prior keys (T-07-01 invariant).
  activeAIProvider: null,
  providerConfigs: DEFAULT_PROVIDER_CONFIGS,
  aiCostLedger: { date: new Date().toISOString().slice(0, 10), usdToday: 0 },
  autoAIReviewOnAC: false,  // AIREV-01 default OFF — user must opt in
  // Phase 10 — contest defaults. No active session, analysis opt-in OFF,
  // no cached contest index.
  contestSession: null,
  autoAIContestAnalysis: false,
  contestIndex: null,
  autoAIKnowledgeGraph: true,  // AIKG-01 default ON — core feature
  featureFlags: { lookAheadEdges: false },  // AIKG-06 default OFF — experimental
  noteTemplate: '',  // '' = use built-in DEFAULT_TEMPLATE
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

// --- Phase 07 AI shape-guards ---------------------------------------------
// T-07-01 mitigation: every new field has a one-direction guard with safe
// per-provider default fallback. Mirror the strict posture of
// previewClickBehavior at load: anything that isn't literally the known
// shape collapses to a default (no exceptions thrown).

const VALID_AI_PROVIDERS: ReadonlySet<AIProvider> = new Set<AIProvider>([
  'anthropic',
  'openai',
  'openrouter',
  'ollama',
  'custom',
  // Phase 08.1 Plan 02 — Bedrock joins the locked set.
  'bedrock',
]);

/** Phase 08.1 Plan 02 — locked set of valid `BedrockProviderConfig.authMethod`
 *  values. Matches the 4 options in 08.1-CONTEXT.md decision B. Anything
 *  outside this set collapses to `'default-chain'` at load via
 *  `sanitizeBedrockProviderConfig`. */
const VALID_BEDROCK_AUTH_METHODS: ReadonlySet<BedrockProviderConfig['authMethod']> =
  new Set<BedrockProviderConfig['authMethod']>([
    'default-chain',
    'access-keys',
    'sso-profile',
    'api-key',
  ]);

/** Strict membership test for the AIProvider union. Anything outside the
 *  locked 5-entry set (typos, legacy values, non-strings) returns false so
 *  the load path collapses `activeAIProvider` to null. */
function isValidProviderId(v: unknown): v is AIProvider {
  return typeof v === 'string' && VALID_AI_PROVIDERS.has(v as AIProvider);
}

/** Per-field shape-guard for ProviderConfig. `defaults` is the per-provider
 *  default config so each malformed field falls back to the right baseline
 *  (e.g. http://localhost for ollama, https://api.anthropic.com/v1 for
 *  anthropic). All-or-nothing: if `raw` is null or non-object, returns
 *  `defaults` whole. */
function sanitizeProviderConfig(
  raw: unknown,
  defaults: ProviderConfig,
): ProviderConfig {
  if (!raw || typeof raw !== 'object') return { ...defaults };
  const r = raw as Partial<Record<keyof ProviderConfig, unknown>>;
  // baseUrl: must match http(s):// — admits Ollama's http://localhost path
  // alongside https:// for cloud providers. Anything else (ftp://, mailto:,
  // empty string) falls through to the per-provider default.
  const baseUrl =
    typeof r.baseUrl === 'string' && /^https?:\/\//.test(r.baseUrl)
      ? r.baseUrl
      : defaults.baseUrl;
  return {
    apiKey: typeof r.apiKey === 'string' ? r.apiKey : '',
    baseUrl,
    model: typeof r.model === 'string' && r.model.length > 0 ? r.model : defaults.model,
    // Strict-true only (mirrors `legacyBaseNoticeShown` at load): the boolean
    // must be literally `true`; 'yes', 1, truthy strings, etc. all collapse
    // to false so a corrupt data.json cannot silently flip a user past the
    // disclosure gate (T-07-05).
    disclosureAcknowledged: r.disclosureAcknowledged === true,
  };
}

/** Phase 08.1 Plan 02 — shape-guard for `BedrockProviderConfig`. Mirrors
 *  `sanitizeProviderConfig`'s posture (T-07-01 — every field guarded with a
 *  per-default fallback) and adds:
 *    - `authMethod` collapses to `defaults.authMethod` (`'default-chain'`)
 *      when the input is not in `VALID_BEDROCK_AUTH_METHODS`.
 *    - All 4 secret fields (`accessKeyId`, `secretAccessKey`, `ssoProfile`,
 *      `bedrockApiKey`) are PRESERVED verbatim regardless of `authMethod`.
 *      Pitfall 10 (08.1-RESEARCH.md) — switching `authMethod` mid-edit must
 *      NOT clear secrets in inactive modes; only the rendered Settings rows
 *      change. The shape-guard preserves the field shape every load, even
 *      across downgrades that touch authMethod through the UI.
 *  Returns `{ ...defaults }` whole when `raw` is null or non-object. */
function sanitizeBedrockProviderConfig(
  raw: unknown,
  defaults: BedrockProviderConfig,
): BedrockProviderConfig {
  if (!raw || typeof raw !== 'object') return { ...defaults };
  const r = raw as Partial<Record<keyof BedrockProviderConfig, unknown>>;
  const authMethodRaw = r.authMethod;
  const authMethod: BedrockProviderConfig['authMethod'] =
    typeof authMethodRaw === 'string' &&
    VALID_BEDROCK_AUTH_METHODS.has(authMethodRaw as BedrockProviderConfig['authMethod'])
      ? (authMethodRaw as BedrockProviderConfig['authMethod'])
      : defaults.authMethod;
  return {
    // Inherited ProviderConfig fields — kept loose-typed (apiKey/baseUrl/model
    // are unused by the bedrock adapter; we still preserve whatever the user
    // had to keep round-tripping byte-clean).
    apiKey: typeof r.apiKey === 'string' ? r.apiKey : '',
    baseUrl: typeof r.baseUrl === 'string' ? r.baseUrl : '',
    model: typeof r.model === 'string' ? r.model : '',
    // Strict-true only — corrupt data.json cannot silently flip past the
    // disclosure gate (T-07-05 mirrors).
    disclosureAcknowledged: r.disclosureAcknowledged === true,
    // Bedrock-only fields.
    region:
      typeof r.region === 'string' && r.region.length > 0 ? r.region : defaults.region,
    modelId:
      typeof r.modelId === 'string' && r.modelId.length > 0 ? r.modelId : defaults.modelId,
    authMethod,
    // All 4 secret fields preserved verbatim regardless of authMethod
    // (Pitfall 10 — mode switch must not clear inactive-mode secrets).
    accessKeyId: typeof r.accessKeyId === 'string' ? r.accessKeyId : '',
    secretAccessKey: typeof r.secretAccessKey === 'string' ? r.secretAccessKey : '',
    ssoProfile: typeof r.ssoProfile === 'string' ? r.ssoProfile : '',
    bedrockApiKey: typeof r.bedrockApiKey === 'string' ? r.bedrockApiKey : '',
    sessionToken: typeof r.sessionToken === 'string' ? r.sessionToken : '',
  };
}

/** Shape-guard for AICostLedger. Date must be YYYY-MM-DD; usdToday must be
 *  a finite, non-negative number. Any malformed input collapses to today's
 *  local-day with usdToday=0 (D-F). */
function sanitizeAICostLedger(raw: unknown): AICostLedger {
  const today = new Date().toISOString().slice(0, 10);
  if (!raw || typeof raw !== 'object') return { date: today, usdToday: 0 };
  const r = raw as { date?: unknown; usdToday?: unknown };
  const dateOk = typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date);
  const usdOk =
    typeof r.usdToday === 'number' && Number.isFinite(r.usdToday) && r.usdToday >= 0;
  // T-07-01: when EITHER field is malformed, BOTH reset together so a corrupt
  // ledger can't carry a stale usdToday under a bogus date label.
  if (!dateOk || !usdOk) return { date: today, usdToday: 0 };
  return { date: r.date as string, usdToday: r.usdToday as number };
}

// --- Phase 10 Contest shape-guards ------------------------------------------
// T-10-02 mitigation: every new contest field has a one-direction guard with
// safe default fallback. Mirrors the strict posture of autoAIReviewOnAC.

const VALID_CONTEST_TYPES: ReadonlySet<string> = new Set(['weekly', 'biweekly']);
const VALID_PROBLEM_VERDICTS: ReadonlySet<string> = new Set(['unsolved', 'attempted', 'accepted']);

/** Shape-guard for ContestProblemState. Rejects malformed entries so a corrupt
 *  data.json cannot leave an orphan contest with broken problem state. */
function isValidContestProblemState(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.slug === 'string' && p.slug.length > 0 &&
    typeof p.title === 'string' &&
    typeof p.credit === 'number' && Number.isFinite(p.credit) &&
    typeof p.difficulty === 'number' &&
    typeof p.verdict === 'string' && VALID_PROBLEM_VERDICTS.has(p.verdict) &&
    typeof p.code === 'string' &&
    typeof p.language === 'string' &&
    (p.solvedAt === null || (typeof p.solvedAt === 'number' && Number.isFinite(p.solvedAt)))
  );
}

/** Shape-guard for ContestSession. Validates all required fields + nested
 *  problems array. Malformed input collapses to null (no orphan contest). */
function isValidContestSession(v: unknown): v is ContestSession {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  if (typeof s.contestSlug !== 'string' || s.contestSlug.length === 0) return false;
  if (typeof s.contestTitle !== 'string') return false;
  if (typeof s.contestType !== 'string' || !VALID_CONTEST_TYPES.has(s.contestType)) return false;
  if (typeof s.duration !== 'number' || !Number.isFinite(s.duration) || s.duration <= 0) return false;
  if (typeof s.startedAt !== 'number' || !Number.isFinite(s.startedAt)) return false;
  if (typeof s.pausedDuration !== 'number' || !Number.isFinite(s.pausedDuration)) return false;
  if (typeof s.isPaused !== 'boolean') return false;
  if (s.pausedAt !== null && (typeof s.pausedAt !== 'number' || !Number.isFinite(s.pausedAt))) return false;
  if (!Array.isArray(s.problems)) return false;
  return (s.problems as unknown[]).every(isValidContestProblemState);
}

/** Shape-guard for ContestIndex. Validates fetchedAt + contests array with
 *  each entry checked for required fields. Malformed input collapses to null. */
function isValidContestIndex(v: unknown): v is ContestIndex {
  if (!v || typeof v !== 'object') return false;
  const idx = v as Record<string, unknown>;
  if (typeof idx.fetchedAt !== 'number' || !Number.isFinite(idx.fetchedAt)) return false;
  if (!Array.isArray(idx.contests)) return false;
  return (idx.contests as unknown[]).every((c) => {
    if (!c || typeof c !== 'object') return false;
    const e = c as Record<string, unknown>;
    return (
      typeof e.slug === 'string' && e.slug.length > 0 &&
      typeof e.title === 'string' &&
      typeof e.startTime === 'number' && Number.isFinite(e.startTime) &&
      typeof e.duration === 'number' && Number.isFinite(e.duration) &&
      typeof e.type === 'string' && VALID_CONTEST_TYPES.has(e.type)
    );
  });
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
      // Phase 16 INDENT-04 D-06 — strict-equality shape-guard. Only literal
      // numbers 2/4/8 pass; everything else (missing field, wrong type,
      // string '4', invalid number 3, null, the literal string 'auto')
      // collapses to 'auto'. Mirrors the previewClickBehavior strict-true
      // posture (RESEARCH §7) — corrupt data.json never silently flips the
      // user away from the language default.
      indentSizeOverride: (raw.indentSizeOverride === 2 ||
                           raw.indentSizeOverride === 4 ||
                           raw.indentSizeOverride === 8)
        ? raw.indentSizeOverride
        : 'auto',
      showRelativeLineNumbers: typeof raw.showRelativeLineNumbers === 'boolean'
        ? raw.showRelativeLineNumbers
        : false,
      // Phase 22 (D-settings-01) — `useInlineWidget` / `useNestedEditor` are
      // dropped from the in-memory shape. Persisted values in 1.2.x carry-over
      // `data.json` files are silently ignored on load; the next `persist()`
      // writes the new canonical shape and the legacy fields disappear from
      // disk naturally (read-and-ignore).
      // Phase 21 MIGRATE-06 — non-boolean raw / missing field / corrupt
      // data.json all collapse to true (DEFAULT_DATA.autoMigrateOnOpen).
      // Default ON matches MIGRATE-06; user explicitly opts out via the
      // Settings → Experimental toggle.
      autoMigrateOnOpen: typeof raw.autoMigrateOnOpen === 'boolean'
        ? raw.autoMigrateOnOpen
        : DEFAULT_DATA.autoMigrateOnOpen,
      // Phase 19 C-06 — strict-equality shape-guard. Only literal numbers
      // 300/400/500/1000/2000 pass; everything else (string '400', null,
      // missing field, invalid number 250, the literal string 'auto') collapses
      // to 400. Mirrors the indentSizeOverride posture at lines 664-668.
      widgetSyncDebounceMs: (raw.widgetSyncDebounceMs === 300 ||
                             raw.widgetSyncDebounceMs === 400 ||
                             raw.widgetSyncDebounceMs === 500 ||
                             raw.widgetSyncDebounceMs === 1000 ||
                             raw.widgetSyncDebounceMs === 2000)
        ? raw.widgetSyncDebounceMs
        : DEFAULT_DATA.widgetSyncDebounceMs,
      problemIndex: isValidProblemIndex(raw.problemIndex) ? raw.problemIndex : DEFAULT_DATA.problemIndex,
      filter: isValidCompoundFilter(raw.filter)
        ? sanitizeCompoundFilter(raw.filter)
        : DEFAULT_DATA.filter,
      problemDetails: sanitizeProblemDetails(raw.problemDetails),
      legacyBaseNoticeShown: raw.legacyBaseNoticeShown === true,
      // Phase 4 D-21 + Pitfall 9 — autoBacklinksEnabled shape-guard. Malicious
      // or malformed data.json (e.g. `"yes"`) falls back to the default
      // (`true`). Old Phase 1/2/3-era data.json files with no field fall
      // back to `true` (T-04-02-02 threat mitigation).
      autoBacklinksEnabled: typeof raw.autoBacklinksEnabled === 'boolean'
        ? raw.autoBacklinksEnabled
        : DEFAULT_DATA.autoBacklinksEnabled,
      // Phase 5 POLISH-01 D-15 — techniquesFolderOverride shape-guard.
      // Non-string raw (object / number / null) falls back to '' (= derived
      // default). NOTE: do NOT invoke sanitizeFolder here — its empty-string
      // fallback is `'LeetCode'`, which would break the "empty = use derived
      // default" contract (CF-08 + D-15). UI layer trims trailing slashes
      // before set; raw pass-through on load keeps the contract clean.
      techniquesFolderOverride: typeof raw.techniquesFolderOverride === 'string'
        ? raw.techniquesFolderOverride
        : DEFAULT_DATA.techniquesFolderOverride,
      // Phase 06 PREVIEW-02 — locked schema (RESEARCH §Pitfall 7). Anything
      // that isn't literally the string 'open' falls through to 'preview':
      // fresh install (missing field), wrong type (number / object / null),
      // case-mismatch typos ('OPEN'), unknown future enum values — all
      // collapse to the safe single-default per CONTEXT.md decision A.
      previewClickBehavior: raw.previewClickBehavior === 'open' ? 'open' : 'preview',
      // Phase 07 Plan 01 — AI fields hydrate via per-field shape-guards
      // (T-07-01 mitigation per CONTEXT line 226). isValidProviderId returns
      // false for unknown enum values, so corrupt activeAIProvider collapses
      // to null. Every providerConfigs[provider] is rebuilt from the raw map
      // with its provider-specific default as fallback so a malformed entry
      // for one provider doesn't poison the others.
      activeAIProvider: isValidProviderId(raw.activeAIProvider) ? raw.activeAIProvider : null,
      providerConfigs: {
        anthropic: sanitizeProviderConfig(
          (raw.providerConfigs as Record<string, unknown> | undefined)?.anthropic,
          DEFAULT_PROVIDER_CONFIGS.anthropic,
        ),
        openai: sanitizeProviderConfig(
          (raw.providerConfigs as Record<string, unknown> | undefined)?.openai,
          DEFAULT_PROVIDER_CONFIGS.openai,
        ),
        openrouter: sanitizeProviderConfig(
          (raw.providerConfigs as Record<string, unknown> | undefined)?.openrouter,
          DEFAULT_PROVIDER_CONFIGS.openrouter,
        ),
        ollama: sanitizeProviderConfig(
          (raw.providerConfigs as Record<string, unknown> | undefined)?.ollama,
          DEFAULT_PROVIDER_CONFIGS.ollama,
        ),
        custom: sanitizeProviderConfig(
          (raw.providerConfigs as Record<string, unknown> | undefined)?.custom,
          DEFAULT_PROVIDER_CONFIGS.custom,
        ),
        // Phase 08.1 Plan 02 — bedrock hydrates via the dedicated shape-guard
        // because BedrockProviderConfig has 7 fields beyond the 4 inherited
        // ProviderConfig fields.
        bedrock: sanitizeBedrockProviderConfig(
          (raw.providerConfigs as Record<string, unknown> | undefined)?.bedrock,
          DEFAULT_PROVIDER_CONFIGS.bedrock as BedrockProviderConfig,
        ),
      },
      aiCostLedger: sanitizeAICostLedger(raw.aiCostLedger),
      // Phase 09 AIREV-01 — autoAIReviewOnAC shape-guard (T-09-04).
      // Non-boolean raw (string "true", number, null, object) collapses to
      // false — never enables AI calls from corrupt data.json.
      autoAIReviewOnAC: typeof raw.autoAIReviewOnAC === 'boolean'
        ? raw.autoAIReviewOnAC
        : DEFAULT_DATA.autoAIReviewOnAC,
      // Phase 10 — contest state shape-guards. Malformed values collapse to
      // null/false so a corrupt data.json cannot leave the plugin in a broken
      // contest state or silently enable AI calls.
      contestSession: isValidContestSession(raw.contestSession)
        ? raw.contestSession
        : DEFAULT_DATA.contestSession,
      autoAIContestAnalysis: typeof raw.autoAIContestAnalysis === 'boolean'
        ? raw.autoAIContestAnalysis
        : DEFAULT_DATA.autoAIContestAnalysis,
      contestIndex: isValidContestIndex(raw.contestIndex)
        ? raw.contestIndex
        : DEFAULT_DATA.contestIndex,
      autoAIKnowledgeGraph: typeof raw.autoAIKnowledgeGraph === 'boolean'
        ? raw.autoAIKnowledgeGraph
        : DEFAULT_DATA.autoAIKnowledgeGraph,
      featureFlags: (raw.featureFlags && typeof raw.featureFlags === 'object'
        && typeof (raw.featureFlags as Record<string, unknown>).lookAheadEdges === 'boolean')
        ? { lookAheadEdges: (raw.featureFlags as Record<string, unknown>).lookAheadEdges as boolean }
        : DEFAULT_DATA.featureFlags,
      noteTemplate: typeof raw.noteTemplate === 'string' && raw.noteTemplate.length > 0
        ? raw.noteTemplate
        : DEFAULT_DATA.noteTemplate,
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

  /** Phase 16 INDENT-04 D-06 — read the user's code-editor indent override.
   *  `'auto'` defers to the per-language default (4 for Python/Java/C/C++/Rust,
   *  2 for JS/TS, tab for Go); a numeric literal forces that many spaces.
   *  NOTE: Go always uses tab regardless of this override (gofmt is
   *  non-negotiable). The exception is enforced by the consumer
   *  (`childEditorLanguage.ts:effectiveIndent`), not this field. */
  getIndentSizeOverride(): 'auto' | 2 | 4 | 8 {
    return this.data.indentSizeOverride;
  }

  /** Phase 16 INDENT-04 D-06 — persist the indent override. UI bound to the
   *  Settings tab "Code editor → Indent size" dropdown. */
  async setIndentSizeOverride(v: 'auto' | 2 | 4 | 8): Promise<void> {
    this.data.indentSizeOverride = v;
    await this.persist();
  }

  getShowRelativeLineNumbers(): boolean {
    return this.data.showRelativeLineNumbers;
  }

  async setShowRelativeLineNumbers(v: boolean): Promise<void> {
    this.data.showRelativeLineNumbers = v;
    await this.persist();
  }

  /** Phase 21 MIGRATE-06 — read auto-migrate setting. Read at every
   *  `migrateLegacyFenceIfNeeded` call site (mount path); live-applies
   *  (toggle takes effect on next file open without reload — no widget
   *  destroy needed). */
  getAutoMigrateOnOpen(): boolean { return this.data.autoMigrateOnOpen; }

  /** Phase 21 MIGRATE-06 — persist auto-migrate setting. Live-apply: no
   *  reload required (next mount-path read picks up the new value). */
  async setAutoMigrateOnOpen(v: boolean): Promise<void> {
    this.data.autoMigrateOnOpen = v;
    await this.persist();
  }

  /** Phase 19 C-06 — read the debounced writer delay (ms). Plan 19-02 owns
   *  the debouncedWriter that consumes this; Plan 19-01 only ships the
   *  persistence + UI plumbing. */
  getWidgetSyncDebounceMs(): 300 | 400 | 500 | 1000 | 2000 {
    return this.data.widgetSyncDebounceMs;
  }

  /** Phase 19 C-06 — persist the debounced writer delay. Bound to the
   *  Settings tab → Experimental → Save delay dropdown (5 options). */
  async setWidgetSyncDebounceMs(v: 300 | 400 | 500 | 1000 | 2000): Promise<void> {
    this.data.widgetSyncDebounceMs = v;
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

  /** Phase 4 D-21 — read the auto-backlink opt-out flag. When false,
   *  KnowledgeGraphWriter skips the ## Techniques body write + stub creation
   *  on AC (frontmatter writes still fire — D-20). */
  getAutoBacklinksEnabled(): boolean { return this.data.autoBacklinksEnabled; }

  /** Phase 4 D-21 — persist the auto-backlink opt-out flag. Setter ships in
   *  Phase 4; the Settings UI control lands in Phase 5 POLISH-01. */
  async setAutoBacklinksEnabled(v: boolean): Promise<void> {
    this.data.autoBacklinksEnabled = v;
    await this.persist();
  }

  /** Phase 06 PREVIEW-02 — read the row-click default behavior. CONTEXT.md
   *  decision A: 'preview' = single-click previews (default); 'open' =
   *  v1.0 click-to-open behavior. Shift-click always opens regardless of
   *  this setting (override lives in routeProblemClick on LeetCodePlugin). */
  getPreviewClickBehavior(): 'preview' | 'open' {
    return this.data.previewClickBehavior;
  }

  /** Phase 06 PREVIEW-02 — persist the row-click default. Bound to the new
   *  Settings tab `Preview › Click behavior` dropdown (06-UI-SPEC). */
  async setPreviewClickBehavior(v: 'preview' | 'open'): Promise<void> {
    this.data.previewClickBehavior = v;
    await this.persist();
  }

  /** Phase 5 POLISH-01 D-15 — read the user-visible technique folder override.
   *  Empty string '' = no override (use derived default in
   *  `getTechniquesFolder`). Any non-empty value is an explicit override. */
  getTechniquesFolderOverride(): string {
    return this.data.techniquesFolderOverride;
  }

  /** Phase 5 POLISH-01 D-15 — persist the technique folder override. Setter
   *  accepts raw input; the UI layer is responsible for trimming trailing
   *  slashes before calling this (Phase 4 convention keeps sanitization in
   *  the UI + shape-guard on load). */
  async setTechniquesFolderOverride(v: string): Promise<void> {
    this.data.techniquesFolderOverride = v;
    await this.persist();
  }

  /** Phase 09 AIREV-01 — read the auto AI review on Accepted opt-in flag.
   *  When false, no AI review is generated on AC. Default false. */
  getAutoAIReviewOnAC(): boolean { return this.data.autoAIReviewOnAC; }

  /** Phase 09 AIREV-01 — persist the auto AI review on Accepted opt-in flag. */
  async setAutoAIReviewOnAC(value: boolean): Promise<void> {
    this.data.autoAIReviewOnAC = value;
    await this.persist();
  }

  // --- Phase 10 Contest -----------------------------------------------------

  /** Phase 10 CONTEST-03 — read the active contest session. Null when idle. */
  getContestSession(): ContestSession | null { return this.data.contestSession; }

  /** Phase 10 CONTEST-03 — persist the contest session state. Called on every
   *  significant state change (start, pause, resume, verdict, code debounce). */
  async setContestSession(s: ContestSession | null): Promise<void> {
    this.data.contestSession = s;
    await this.persist();
  }

  /** Phase 10 CONTEST-08 — read the auto AI contest analysis opt-in flag.
   *  When false, no AI analysis is generated on contest end. Default false. */
  getAutoAIContestAnalysis(): boolean { return this.data.autoAIContestAnalysis; }

  /** Phase 10 CONTEST-08 — persist the auto AI contest analysis opt-in flag. */
  async setAutoAIContestAnalysis(value: boolean): Promise<void> {
    this.data.autoAIContestAnalysis = value;
    await this.persist();
  }

  /** Phase 10 CONTEST-01 — read the cached contest index. Null when never fetched. */
  getContestIndex(): ContestIndex | null { return this.data.contestIndex; }

  /** Phase 10 CONTEST-01 — persist the contest index (slug list + fetchedAt). */
  async setContestIndex(idx: ContestIndex | null): Promise<void> {
    this.data.contestIndex = idx;
    await this.persist();
  }

  getAutoAIKnowledgeGraph(): boolean { return this.data.autoAIKnowledgeGraph; }

  async setAutoAIKnowledgeGraph(value: boolean): Promise<void> {
    this.data.autoAIKnowledgeGraph = value;
    await this.persist();
  }

  getFeatureFlags(): { lookAheadEdges: boolean } { return this.data.featureFlags; }

  async setFeatureFlag(key: 'lookAheadEdges', value: boolean): Promise<void> {
    this.data.featureFlags = { ...this.data.featureFlags, [key]: value };
    await this.persist();
  }

  /** Ticket #5 — read the user's note template. Empty = use built-in default. */
  getNoteTemplate(): string { return this.data.noteTemplate; }

  /** Ticket #5 — persist the user's note template. */
  async setNoteTemplate(v: string): Promise<void> {
    this.data.noteTemplate = v;
    await this.persist();
  }

  /** Phase 5 POLISH-01 D-15 — override-aware Techniques folder path. Returns
   *  the user's override verbatim when non-empty; otherwise derives from
   *  `{problemsFolder}/Techniques` (Phase 4 D-15 behavior preserved for users
   *  who never touch the new setting). Respects sanitizeFolder's
   *  no-trailing-slash invariant from Phase 1 D-10. */
  getTechniquesFolder(): string {
    const override = this.data.techniquesFolderOverride;
    return override && override.length > 0
      ? override
      : `${this.getProblemsFolder()}/Techniques`;
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

  /** Phase 3 D-30 — read the internal LC questionId for a slug, if cached.
   *  Returns null if the slug has no cached detail or the detail pre-dates
   *  Phase 3 (no internalQuestionId field). Plan 05's SubmissionOrchestrator
   *  falls back to a live fetch when this returns null. */
  getInternalQuestionId(slug: string): string | null {
    const entry = this.getProblemDetail(slug);
    return entry?.internalQuestionId ?? null;
  }

  /** GAP-6: has the one-time "regenerate LeetCode.base" Notice fired yet?
   *  Checked by main.ts on every plugin load — returns true once the Notice
   *  has been shown so we don't spam the user on subsequent loads. */
  hasShownLegacyBaseNotice(): boolean {
    return this.data.legacyBaseNoticeShown === true;
  }

  /** GAP-6: mark the one-time "regenerate LeetCode.base" Notice as shown and
   *  persist so subsequent plugin loads skip the notice path. */
  async markLegacyBaseNoticeShown(): Promise<void> {
    this.data.legacyBaseNoticeShown = true;
    await this.persist();
  }

  /** Remove cache entries older than `maxAgeMs`. Returns pruned count.
   *  Opportunistic; called at caller's discretion (D-15). */
  async pruneProblemDetails(maxAgeMs: number): Promise<number> {
    const cutoff = Date.now() - maxAgeMs;
    let pruned = 0;
    for (const [slug, entry] of Object.entries(this.data.problemDetails)) {
      if (entry.fetchedAt < cutoff) {
        delete this.data.problemDetails[slug];
        pruned++;
      }
    }
    if (pruned > 0) await this.persist();
    return pruned;
  }

  // --- Phase 07 AI ---------------------------------------------------------
  // AIPROV-01 + AIPROV-06 surface. Setters re-sanitize any incoming
  // ProviderConfig so a buggy command-layer caller in Plan 07-06 cannot
  // poison data.json (T-07-01-b). All setters persist via this.persist().

  /** Phase 07 AIPROV-01 — currently-active AI provider, null when none. */
  getActiveAIProvider(): AIProvider | null {
    return this.data.activeAIProvider;
  }

  /** Phase 07 AIPROV-01 — set the active provider. Switching from X→Y leaves
   *  `providerConfigs[X]` byte-for-byte unchanged (T-07-01 invariant). */
  async setActiveAIProvider(p: AIProvider | null): Promise<void> {
    this.data.activeAIProvider = p;
    await this.persist();
  }

  /** Phase 07 AIPROV-01 — read the per-provider config. Always returns a
   *  defined ProviderConfig because load hydrates all 6 entries.
   *
   *  Phase 08.1 Plan 02 — bedrock entries are stored as BedrockProviderConfig
   *  (a superset of ProviderConfig); callers that need Bedrock-specific fields
   *  cast `getProviderConfig('bedrock') as BedrockProviderConfig`. */
  getProviderConfig(p: AIProvider): ProviderConfig {
    return this.data.providerConfigs[p];
  }

  /** Phase 07 AIPROV-01 — persist a per-provider config. Re-sanitizes the
   *  incoming value against the per-provider default so a buggy caller cannot
   *  poison data.json (T-07-01-b).
   *
   *  Phase 08.1 Plan 02 — signature widened to `ProviderConfig |
   *  BedrockProviderConfig` so callers can pass a full BedrockProviderConfig
   *  literal without casting at the call site. Runtime dispatch checks
   *  `p === 'bedrock'` to route through the dedicated shape-guard
   *  (`sanitizeBedrockProviderConfig`), preserving all 7 Bedrock-only fields
   *  (region/modelId/authMethod + 4 secrets); other providers continue to
   *  use the inherited `sanitizeProviderConfig`. */
  async setProviderConfig(
    p: AIProvider,
    cfg: ProviderConfig | BedrockProviderConfig,
  ): Promise<void> {
    if (p === 'bedrock') {
      this.data.providerConfigs[p] = sanitizeBedrockProviderConfig(
        cfg,
        DEFAULT_PROVIDER_CONFIGS.bedrock as BedrockProviderConfig,
      );
    } else {
      this.data.providerConfigs[p] = sanitizeProviderConfig(
        cfg,
        DEFAULT_PROVIDER_CONFIGS[p] as ProviderConfig,
      );
    }
    await this.persist();
  }

  /** Phase 07 AIPROV-06 + decision F — read the daily AI cost ledger. NOTE:
   *  this getter does NOT roll over; rollover happens on write via
   *  `addCostLedger`. Callers reading for display should compare `date` to
   *  today's local-day if they want a "rolled-over view" without writing. */
  getAICostLedger(): AICostLedger {
    return this.data.aiCostLedger;
  }

  /** Phase 07 AIPROV-06 + decision F — accumulate an AI call's USD cost into
   *  today's ledger. Day-rollover-on-read: when local-day differs from the
   *  ledger date, ledger resets to `{ today, 0 }` BEFORE adding `usd`.
   *  Non-finite or negative values are silently ignored (matches v1.0
   *  throttle posture: malformed input is a no-op, not an error). */
  async addCostLedger(usd: number): Promise<void> {
    if (!Number.isFinite(usd) || usd < 0) return;
    const today = new Date().toISOString().slice(0, 10);
    if (this.data.aiCostLedger.date !== today) {
      this.data.aiCostLedger = { date: today, usdToday: 0 };
    }
    this.data.aiCostLedger.usdToday += usd;
    await this.persist();
  }

  private async persist(): Promise<void> {
    await this.plugin.saveData(this.data);
  }
}
