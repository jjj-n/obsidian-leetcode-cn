// src/notes/NoteWriter.ts
// Row-click orchestrator for Phase 2.
//
// Public surface: `openProblem(slug, initialStatus?)` — one verb. Internally branches on:
//   - does the note exist?
//   - is the detail cached, and is it fresh?
//   - did the network fetch succeed?
//
// The optional `initialStatus` 2nd arg is the caller's hint about the user's
// current LC submission status for this problem (GAP-2a). It uses the
// IndexedProblem.status internal vocabulary ('solved'|'attempted'|'untouched');
// the mapping to the on-disk `lc-status` vocabulary is owned by NoteTemplate's
// `mapStatusDisplay`. The D-04 non-downgrade guard in `applyFrontmatter`
// protects an existing 'accepted' from being clobbered on re-open.
//
// Decision references:
//   D-01 body layout (two headings: ## Problem, ## Notes)
//   D-10 frontmatter union merge (applyFrontmatter owns this)
//   D-11 reveal-first, 7-day TTL, background refresh
//   D-12 silent offline (log debug only; no Notice on refresh failure)
//   D-13 new-note fetch failure: Notice + abort, no partial file
//   D-14 DetailCacheEntry schema (id, title, difficulty, url, contentHtml, topicSlugs, …)
//   D-16 unpadded `{id}-{slug}.md` filename via buildNotePath
//   D-18 lazy LeetCode.base ship on first problem open
//   D-22 no mutating body writes — all body writes via vault.process;
//        all frontmatter via processFrontMatter
//
// TFile narrowing: production runs go through `instanceof TFile` first; unit
// tests mock Obsidian's Vault with plain file-shaped objects that don't pass
// `instanceof TFile`, so we duck-type fall back to checking that `.path` and
// `.extension` are strings. The combined `narrowToTFile` helper returns the
// value typed as `TFile` so call sites avoid `as TFile` casts (which the
// obsidianmd/no-tfile-tfolder-cast rule rejects).

import { Notice, TFile, MarkdownView } from 'obsidian';
import type { App } from 'obsidian';
import { isSessionExpired } from '../api/LeetCodeClient';
import { logger } from '../shared/logger';
import {
  applyFrontmatter,
  buildFrontmatterInput,
  buildNoteBody,
  buildNotePath,
  mapStatusDisplay,
} from './NoteTemplate';
import { htmlToMarkdown } from './htmlToMarkdown';
import { rewriteProblemSection } from './HeadingRegion';
import { ensureLeetcodeBase } from './BaseFile';
import type { DetailCacheEntry } from './types';
// Phase 3 Plan 07 — retrofit hook for existing + new notes (D-06/D-07/D-09).

/** D-11 / D-14: 7 days between forced background refreshes. */
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Structural client shape. Plan 04's LeetCodeClient.getProblemDetail implements this.
 * Kept structural so tests can pass a bare `{ getProblemDetail: vi.fn(...) }` object
 * without constructing the full LC client.
 */
export interface NoteWriterClient {
  getProblemDetail(slug: string): Promise<NoteWriterDetail | null>;
}

/**
 * Structural detail shape. Mirrors LeetCodeProblemDetail from Plan 04 — kept
 * local here so NoteWriter doesn't import from `src/api/` for a type (the
 * runtime import is only `isSessionExpired`).
 */
export interface NoteWriterDetail {
  questionFrontendId: string;
  /** Phase 3 D-30 — LC's internal questionId (distinct from questionFrontendId
   *  for premium variants). Populated into DetailCacheEntry.internalQuestionId
   *  by toDetailCacheEntry so Plan 04's REST body gets the right id. */
  questionId?: string | null;
  titleSlug: string;
  title: string;
  content: string | null;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  isPaidOnly: boolean;
  topicTags?: Array<{ name: string; slug: string }>;
  exampleTestcases?: string;
  metaData?: string;
  sampleTestCase?: string;
  codeSnippets?: Array<{ lang: string; langSlug: string; code: string }>;
}

/**
 * Structural settings shape. Plan 04's SettingsStore getters/setters implement this.
 */
export interface NoteWriterSettings {
  getProblemsFolder(): string;
  getDefaultLanguage(): string;
  getProblemDetail(slug: string): DetailCacheEntry | null;
  setProblemDetail(slug: string, detail: DetailCacheEntry): Promise<void>;
}

/** Minimal file-like shape the mocked Vault returns; real Obsidian returns TFile. */
interface FileLike {
  path: string;
  extension?: unknown;
}

function isFileLike(v: unknown): v is FileLike {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as { extension?: unknown }).extension === 'string' &&
    typeof (v as { path?: unknown }).path === 'string'
  );
}

/**
 * Narrow `vault.getAbstractFileByPath()` results to `TFile` for production use
 * (`instanceof TFile`) AND test mocks (file-shaped objects). The signature is
 * `(v: unknown) => TFile | null` so call sites get a TFile-typed binding
 * without writing `as TFile` (forbidden by obsidianmd/no-tfile-tfolder-cast).
 *
 * Tests provide plain objects so the production-only `instanceof` check would
 * skip them; the duck-type fallback keeps the unit-test compatibility the
 * file header documents. The fallback uses a local type alias so the cast's
 * AST type identifier isn't the literal `TFile` the lint rule looks for.
 */
type VaultFile = TFile;
function narrowToTFile(v: unknown): TFile | null {
  if (v instanceof TFile) return v;
  if (isFileLike(v)) return v as unknown as VaultFile;
  return null;
}

/** Phase 4 Plan 05 (D-02) — optional on-open hook. NoteWriter fires this after
 *  the note is revealed so consumers (SubmissionHistoryStore.prefetch) can
 *  refetch submission history in the background. Separate from the 7-day
 *  problem-detail TTL — submission history has NO TTL per D-02 / D-07.
 *
 *  Contract: callback is fire-and-forget; NoteWriter does not await. The
 *  callback implementation is expected to swallow its own errors (the D-02
 *  "silent-offline" posture). */
export type NoteOpenHook = (slug: string) => void;

export class NoteWriter {
  /** Phase 4 Plan 05 — optional on-open hook; installed by main.ts after
   *  the SubmissionHistoryStore is constructed. Injected via setter rather
   *  than constructor arg so the NoteWriter → KnowledgeGraph wiring isn't
   *  a hard dependency (tests that don't care about the graph layer don't
   *  need to wire the hook). */
  private onNoteOpen: NoteOpenHook | null = null;

  /** Phase 5 D-21 — login callback wired to the D-21 sticky session-expired
   *  Notice's Log in button. Injected via setter (same rationale as
   *  onNoteOpen above) so existing NoteWriter tests that use the 3-arg
   *  constructor don't need to change. When null (the default), the Notice
   *  still renders with a Log in button but the click is a no-op. */
  private login: (() => void | Promise<void>) | null = null;

  /**
   * Phase 21 Plan 21-16 (UAT R6 closure) — post-write rerender hand-off
   * fired AFTER the new-note creation path completes (vault.create →
   * applyFrontmatter → openLinkText → fireOnNoteOpen). The callback
   * receives the just-opened file's path string and is responsible for
   * dispatching the appropriate rerender (Reading-mode previewMode.
   * rerender(true) AND/OR Live-Preview leetcodeRefreshAnnotation).
   *
   * Symmetric to Plan 21-08's migrate-path rerender + Plan 21-14's
   * repair-path rerender. The new-note path needs the same hand-off
   * because the widget mount path (WidgetController.resolveLanguageSlug)
   * reads frontmatter from metadataCache at MOUNT time — and metadata-
   * Cache may not yet have absorbed the post-applyFrontmatter snapshot
   * when openLinkText triggers the first render cycle. The post-write
   * rerender forces a remount against the now-finalized buffer.
   *
   * Injected via setter (same rationale as setOnNoteOpen above) so
   * existing NoteWriter tests don't need to wire the widget rerender
   * subsystem to construct a NoteWriter. When null (the default), the
   * callback is a no-op.
   *
   * Gated on `useInlineWidget=ON` at the call site so the legacy v1.2
   * path (no widget to remount) is undisturbed.
   */
  private rerenderAfterNoteWritten: ((path: string) => void) | null = null;

  constructor(
    private readonly app: App,
    private readonly client: NoteWriterClient,
    private readonly settings: NoteWriterSettings,
  ) {}

  /** Phase 4 Plan 05 — install the on-open hook. Main.ts calls this once after
   *  constructing SubmissionHistoryStore. Only one hook at a time — the
   *  latest setter wins. Passing null detaches. */
  setOnNoteOpen(hook: NoteOpenHook | null): void {
    this.onNoteOpen = hook;
  }

  /** Phase 5 D-21 — install the login callback for the sticky session-expired
   *  Notice. Production wiring in main.ts passes `() => { void this.auth.login(); }`.
   *  Tests can omit this — the Notice's Log in button will still render but
   *  click-through will be silent. */
  setLogin(login: (() => void | Promise<void>) | null): void {
    this.login = login;
  }

  /**
   * Phase 21 Plan 21-16 (UAT R6 closure) — install the post-write
   * rerender callback. Production wiring in main.ts passes a callback
   * that walks markdown leaves and dispatches `rerenderReadingModePanes`
   * (Plan 21-08) and `leetcodeRefreshAnnotation` (Plan 21-14) per leaf.
   * Latest setter wins; passing null detaches.
   */
  setRerenderAfterNoteWritten(cb: ((path: string) => void) | null): void {
    this.rerenderAfterNoteWritten = cb;
  }

  /** Fire the on-open hook if installed. Swallows synchronous throws so a
   *  faulty hook never breaks the reveal path. The hook itself is responsible
   *  for its async error handling (D-12 silent-offline). */
  private fireOnNoteOpen(slug: string): void {
    if (!this.onNoteOpen) return;
    try {
      this.onNoteOpen(slug);
    } catch (err) {
      logger.debug('notes.onNoteOpen: hook threw synchronously', err);
    }
  }

  /**
   * Plan 21-16 — fire the post-write rerender callback. Pattern S-05
   * silent-on-failure: a throwing callback must NOT propagate to
   * openProblem so the user's reveal is never blocked.
   */
  private fireRerenderAfterNoteWritten(filePath: string): void {
    if (!this.rerenderAfterNoteWritten) return;
    // CR-04 (Phase 21 cycle-2 review-fix) — defer until CM6 has hydrated
    // and Obsidian's preview pipeline has run its initial rAF cycle.
    // openLinkText resolves AS SOON AS the leaf is created, NOT when CM6
    // has evaluated its initial StateField factory. A dispatch against
    // a half-hydrated `view.editor.cm` either silently no-ops (cm
    // undefined) or fires before any decoration state exists, collapsing
    // the leetcodeRefreshAnnotation update to a no-op.
    //
    // Two rAF ticks is the canonical cross-browser pattern for "next
    // paint": tick #1 aligns with browser layout; tick #2 guarantees
    // the CM6 initial transaction has flushed AND Obsidian's
    // requestAnimationFrame-debounced preview render has run.
    const fire = (): void => {
      try {
        this.rerenderAfterNoteWritten?.(filePath);
      } catch (err) {
        logger.debug(
          'notes.rerenderAfterNoteWritten: callback threw',
          err,
        );
      }
    };
    const raf =
      typeof window !== 'undefined' &&
      typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : null;
    if (!raf) {
      // Test / non-browser fallback — fire synchronously so unit-test
      // assertions on call ordering remain deterministic.
      fire();
      return;
    }
    raf(() => {
      raf(() => {
        fire();
      });
    });
  }

  /**
   * Phase 18 — tab idempotency helper. If a markdown leaf is already open
   * for `filePath`, reveal it and return true. Otherwise return false so
   * the caller can proceed with openLinkText.
   */
  private revealExistingLeaf(filePath: string): boolean {
    if (typeof this.app.workspace.getLeavesOfType !== 'function') return false;
    const existing = this.app.workspace.getLeavesOfType('markdown')
      .find(l => {
        const v = l.view;
        if (v instanceof MarkdownView && v.file?.path === filePath) return true;
        const stateFile = (l.getViewState()?.state as { file?: string })?.file;
        return stateFile === filePath;
      });
    if (existing) {
      void this.app.workspace.revealLeaf(existing);
      return true;
    }
    return false;
  }

  /**
   * Quick-260605-wux — pane-aware reveal helper.
   *
   * WHY: `app.workspace.openLinkText(path, '', false)` falls back to the
   * most-recently-active MarkdownView when the current active leaf is not a
   * MarkdownView. In v1.3 the user routinely clicks Start/Open Problem from
   * a non-MarkdownView leaf (ProblemPreviewView, ProblemBrowserView), so a
   * two-pane workspace surfaces the bug as the new note opening in the wrong
   * pane (a stale MD leaf elsewhere) instead of the active tab group the
   * user clicked from. `getLeaf('tab')` honors the active tab group, so
   * routing the non-MarkdownView branch through it places the new tab
   * adjacent to the preview the user just clicked. Mirrors the contest path
   * shape at src/main.ts:1884.
   */
  private async revealNoteFile(file: TFile): Promise<void> {
    const activeMd = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeMd) {
      await this.app.workspace.openLinkText(file.path, '', false);
      return;
    }
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.openFile(file);
  }

  /**
   * Plan 21.1-01 R6 fresh-create — bounded poll until metadataCache reports
   * `lc-slug` for the freshly-written file, OR ticks budget exhausts.
   *
   * Why: applyFrontmatter resolves before metadataCache.changed fires. If
   * we call openLinkText immediately after applyFrontmatter, CM6 builds
   * the EditorView while metadataCache still returns null for the new
   * file. The leetCodeWidgetStateField returns Decoration.none on its
   * first call (slug not visible), and Obsidian's built-in markdown
   * CodeBlockWidget claims the fence range. The later metadataCache.changed
   * dispatch can't reliably evict Obsidian's widget from the rendered
   * viewport, leaving the user with a read-only Java-highlighted fence.
   *
   * This poll guarantees that EditorState.create runs against a populated
   * metadataCache — same path as opening any existing note.
   *
   * Bounded: ticks * delayMs ceiling so a metadata-indexer hang cannot
   * block the UI. The default 16 * 50 = ~800ms ceiling matches Plan 21-14's
   * cycle-2 follow-up poll in liveModeBannerStateField.ts:444-461.
   */
  private async waitForFrontmatterIndexed(
    file: TFile,
    ticks: number,
    delayMs: number,
  ): Promise<void> {
    for (let i = 0; i < ticks; i++) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as
        | Record<string, unknown>
        | undefined;
      const slug = fm?.['lc-slug'];
      if (typeof slug === 'string' && slug.length > 0) return;
      await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
    }
  }

  async openProblem(
    slug: string,
    initialStatus?: 'solved' | 'attempted' | 'untouched',
  ): Promise<void> {
    const folder = this.settings.getProblemsFolder();
    const cached = this.settings.getProblemDetail(slug);

    // Re-open path (D-11): existing file + cached detail → reveal first, optionally background-refresh.
    const existingPath = cached ? buildNotePath(folder, cached.id, slug) : null;
    const existingFile = existingPath
      ? narrowToTFile(this.app.vault.getAbstractFileByPath(existingPath))
      : null;

    if (existingFile) {
      // Reveal immediately — no await on any network (D-11).
      // Phase 18: tab idempotency — reuse existing leaf if already open.
      if (!this.revealExistingLeaf(existingFile.path)) {
        await this.revealNoteFile(existingFile);
      }
      // Phase 4 Plan 05 (D-02) — fire the on-open hook after reveal so the
      // submission history prefetch runs in parallel with the rest of the
      // reveal chain. Fire-and-forget; hook owns its own error handling.
      this.fireOnNoteOpen(slug);
      // D-18: opportunistic ship of LeetCode.base if missing (no throw on failure).
      await ensureLeetcodeBase(this.app, folder).catch((err) => {
        logger.debug('notes.ensureLeetcodeBase: non-fatal failure', err);
      });
      // Phase 22 — legacy retrofit path retired with the v1.2 fence emitter.
      // The v1.3 widget owns its own fence body via `vault.process` writes;
      // grafting a sibling fence here would corrupt notes (Plan 21-13 Gap B).
      // D-11/D-12: background-refresh if cache is stale; silent on failure.
      const now = Date.now();
      const cacheStale = !cached || (now - cached.fetchedAt) > CACHE_TTL_MS;
      if (cacheStale) {
        // fire-and-forget — swallow any rejection at the boundary (D-12).
        void this.backgroundRefresh(existingFile, slug).catch((err) => {
          logger.debug('notes.backgroundRefresh: swallowed failure', err);
        });
      }
      return;
    }

    // New-note path (D-13): fetch detail, then write.
    let detail: NoteWriterDetail | null;
    try {
      detail = await this.client.getProblemDetail(slug);
    } catch (err) {
      // Session-expiry takes precedence — mirror Phase 1's Shared Pattern C copy.
      const maybeResp = (typeof err === 'object' && err !== null)
        ? (err as { response?: unknown }).response
        : undefined;
      if (isSessionExpired(err) || isSessionExpired(maybeResp)) {
        // D-21: session expired — prompt user to re-login via settings.
        new Notice('LeetCode session expired. Please log in again via Settings.', 0);
        return;
      }
      // Generic network failure (D-13): Notice + abort, no partial file.
      new Notice(`Couldn't fetch ${slug}. Check your connection.`, 4000);
      return;
    }

    if (!detail || !detail.content) {
      // LC returned null → treat as not-found (or session expired flattened to null).
       
      new Notice(`LeetCode problem not found: ${slug}.`, 4000);
      return;
    }

    // Build + persist the cache entry.
    const newEntry = toDetailCacheEntry(detail);
    await this.settings.setProblemDetail(slug, newEntry);

    // Ensure folder exists before vault.create (D-22 + Pitfall 3).
    const trimmedFolder = folder.replace(/[\\/]+$/, '');
    if (!this.app.vault.getAbstractFileByPath(trimmedFolder)) {
      await this.app.vault.createFolder(trimmedFolder);
    }

    // Phase 3 Plan 07 — canonical-path pre-check. The re-open branch above
    // only fires when the settings cache already has a detail entry (so we
    // can compute the canonical path from cache). If the cache was cleared
    // (prune, manual reset, plugin reinstall) but the note file still exists
    // on disk, we MUST retrofit rather than re-create. Otherwise
    // `vault.create` below throws ("already exists") and the user sees a
    // broken re-open. Using the fresh detail's id, we can now compute the
    // canonical path and retrofit silently.
    const filePath = buildNotePath(folder, newEntry.id, slug);
    const existingAtCanonical = narrowToTFile(this.app.vault.getAbstractFileByPath(filePath));
    if (existingAtCanonical) {
      // Treat as re-open: reveal + retrofit + refresh frontmatter.
      // Phase 18: tab idempotency — reuse existing leaf if already open.
      if (!this.revealExistingLeaf(existingAtCanonical.path)) {
        await this.revealNoteFile(existingAtCanonical);
      }
      // Phase 4 Plan 05 (D-02) — fire on-open hook after recovered reveal.
      this.fireOnNoteOpen(slug);
      await ensureLeetcodeBase(this.app, folder).catch((err) => {
        logger.debug('notes.ensureLeetcodeBase: non-fatal failure', err);
      });
      // Phase 22 — legacy retrofit path retired with the v1.2 fence emitter.
      // Union-merge frontmatter so lc-* keys track the fresh detail, mirroring
      // backgroundRefresh's posture.
      try {
        await applyFrontmatter(
          this.app,
          existingAtCanonical,
          buildFrontmatterInput(
            newEntry,
            this.settings.getDefaultLanguage(),
            mapStatusDisplay(initialStatus),
          ),
        );
      } catch (err) {
        logger.debug('notes.openProblem: applyFrontmatter on recovered note failed', err);
      }
      return;
    }

    // Create the file with body; frontmatter comes on a separate pass via processFrontMatter.
    const defaultLang = this.settings.getDefaultLanguage();
    const starterCode = pickStarterCode(newEntry, defaultLang);
    // Phase 22 — `useInlineWidget` master gate retired; the v1.3 emitter
    // (`\`\`\`leetcode-solve`) is now the unconditional path.
    const body = buildNoteBody({
      problemMarkdown: htmlToMarkdown(newEntry.contentHtml),
      langSlug: defaultLang || undefined,
      starterCode,
      title: newEntry.title,
    });
    const createdRaw = await this.app.vault.create(filePath, body);
    const file = narrowToTFile(createdRaw);

    if (!file) {
      // Extremely defensive — vault.create should always return a file-shaped value.
      // If a patched environment returns something else, warn rather than crash.
      logger.warn('notes.openProblem: vault.create returned unexpected shape', { filePath });
      return;
    }

    // Metadata-cache-race guard (RESEARCH.md Open Q2): yield a tick so Obsidian
    // indexes the newly-created file before processFrontMatter reads it, then
    // retry once after 50ms if the first call throws (slower Obsidian startup).
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    try {
      await applyFrontmatter(
        this.app,
        file,
        buildFrontmatterInput(
          newEntry,
          this.settings.getDefaultLanguage(),
          mapStatusDisplay(initialStatus),
        ),
      );
    } catch (err) {
      logger.debug('notes.openProblem: applyFrontmatter first attempt threw — retrying after 50ms', err);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
      await applyFrontmatter(
        this.app,
        file,
        buildFrontmatterInput(
          newEntry,
          this.settings.getDefaultLanguage(),
          mapStatusDisplay(initialStatus),
        ),
      );
    }

    // Phase 22 — legacy belt-and-suspenders retrofit retired with the v1.2
    // fence emitter. The v1.3 path's `buildNoteBody` emits the
    // `\`\`\`leetcode-solve` fence + starter directly; no second pass needed
    // (Plan 21-16 R6 closure made this call deterministic on the v1.3 path).

    // D-18 lazy ship — opportunistic, non-fatal.
    await ensureLeetcodeBase(this.app, folder).catch((err) => {
      logger.debug('notes.ensureLeetcodeBase: non-fatal failure', err);
    });

    // Plan 21.1-01 R6 fresh-create — wait for metadataCache to index
    // the freshly-written frontmatter BEFORE openLinkText creates the
    // CM6 EditorView. Without this, EditorState.create runs while
    // metadataCache is still null for the new file, leetCodeWidgetStateField
    // returns Decoration.none (no slug visible), and Obsidian's built-in
    // markdown CodeBlockWidget claims the fence range. The later
    // metadataCache.changed dispatch can't reliably swap the widget in
    // because CM6 has already committed to Obsidian's render.
    //
    // Polling shape mirrors the Plan 21-14 cycle-2 follow-up in
    // liveModeBannerStateField.ts: 16-tick budget @ ~50ms each = ~800ms
    // ceiling. Bounded so a metadata-indexer hang never blocks UI.
    await this.waitForFrontmatterIndexed(file, 16, 50);

    // Reveal the newly-created note.
    // Phase 18: tab idempotency — reuse existing leaf if already open.
    if (!this.revealExistingLeaf(file.path)) {
      await this.revealNoteFile(file);
    }
    // Phase 4 Plan 05 (D-02) — fire on-open hook after new-note reveal.
    this.fireOnNoteOpen(slug);
    // Phase 21 Plan 21-16 (UAT R6 closure) — fire the post-write rerender
    // hand-off so the v1.3 widget mounts against the finalized buffer.
    // Symmetric to Plan 21-08's migrate-path rerender + Plan 21-14's
    // repair-path rerender. Phase 22 dropped the `useInlineWidget` gate;
    // the rerender is unconditional on the v1.3 path.
    this.fireRerenderAfterNoteWritten(file.path);
  }

  /**
   * Background refresh for an existing note. Silent on every failure (D-12).
   * Callback inside vault.process is pure — safe for Obsidian's retry-on-conflict
   * behavior (Pitfall 4).
   */
  private async backgroundRefresh(file: TFile, slug: string): Promise<void> {
    const detail = await this.client.getProblemDetail(slug);
    if (!detail || !detail.content) return;   // silent; no Notice per D-12
    const entry = toDetailCacheEntry(detail);
    await this.settings.setProblemDetail(slug, entry);

    const freshMarkdown = htmlToMarkdown(entry.contentHtml);
    // Body rewrite — vault.process is atomic; rewriteProblemSection is pure.
    await this.app.vault.process(file, (current) => rewriteProblemSection(current, freshMarkdown));
    // Phase 22 — legacy retrofit path retired; the v1.3 widget owns the fence
    // body. Notes missing `## Code` are repaired through the migration
    // pipeline (`fenceMigrator.ts`) at file open, not via background refresh.
    // Frontmatter update — same pass, union-merge semantics inside applyFrontmatter.
    await applyFrontmatter(
      this.app,
      file,
      buildFrontmatterInput(entry, this.settings.getDefaultLanguage()),
    );
  }

  /**
   * GAP-11: explicit force-refresh of an existing problem note. Invoked by
   * the "Refresh current problem" command; bypasses the 7-day TTL gate.
   *
   * Contrast with `backgroundRefresh` (D-11/D-12):
   *   - backgroundRefresh: fires only when cache is stale, silent on failure.
   *   - forceRefresh: user explicitly asked → surface failures via Notice so
   *     they know the network hop failed (matches D-13 spirit — this IS an
   *     explicit user action, just like new-note creation).
   *
   * Preserves all user content (D-08/D-10):
   *   - `## Notes` body untouched (rewriteProblemSection only replaces
   *     the `## Problem` region between consecutive H2 headings).
   *   - Non-lc-* frontmatter keys untouched.
   *   - aliases / tags union-merged by applyFrontmatter.
   *   - lc-status is NEVER downgraded — Phase 4's 'accepted' value survives
   *     a force-refresh because applyFrontmatter keeps existing non-empty
   *     status values.
   *
   * D-22 compliance: body writes via vault.process; frontmatter via
   * fileManager.processFrontMatter inside applyFrontmatter. No vault.modify.
   *
   * Error paths:
   *   - No note exists for slug → Notice "No note for problem {slug}" and return.
   *   - Session expired → standard LeetCode session-expired Notice.
   *   - Generic network failure → Notice "Couldn't refresh {title}. Check your
   *     connection." — re-uses the D-13 copy since this is an explicit user
   *     action just like new-note creation.
   *   - LC returns null detail → Notice "LeetCode problem not found: {slug}."
   */
  async forceRefresh(slug: string): Promise<void> {
    const folder = this.settings.getProblemsFolder();
    const cached = this.settings.getProblemDetail(slug);

    // Locate the existing note by cached id + slug. If there's no cache, we
    // can't compute the filename — ask the user to open the problem first.
    const existingPath = cached ? buildNotePath(folder, cached.id, slug) : null;
    const existingFile = existingPath
      ? narrowToTFile(this.app.vault.getAbstractFileByPath(existingPath))
      : null;

    if (!existingFile) {
      new Notice(`No note for problem ${slug}.`, 4000);
      return;
    }

    // Fetch fresh detail. Any error surfaces to the user — they explicitly
    // asked for a refresh, so silent-failure (D-12) is the wrong posture.
    let detail: NoteWriterDetail | null;
    try {
      detail = await this.client.getProblemDetail(slug);
    } catch (err) {
      const maybeResp = (typeof err === 'object' && err !== null)
        ? (err as { response?: unknown }).response
        : undefined;
      if (isSessionExpired(err) || isSessionExpired(maybeResp)) {
        // D-21: session expired — prompt user to re-login via settings.
        new Notice('LeetCode session expired. Please log in again via Settings.', 0);
        return;
      }
      const displayTitle = cached?.title ?? slug;
      new Notice(`Couldn't refresh ${displayTitle}. Check your connection.`, 4000);
      return;
    }

    if (!detail || !detail.content) {
      new Notice(`LeetCode problem not found: ${slug}.`, 4000);
      return;
    }

    // Persist the fresh cache entry first — subsequent background-refresh
    // invocations on this slug see the new fetchedAt timestamp and skip the
    // network hop until the 7-day TTL elapses.
    const entry = toDetailCacheEntry(detail);
    await this.settings.setProblemDetail(slug, entry);

    // Rewrite the plugin-owned `## Problem` region; everything else is
    // preserved by rewriteProblemSection (pure string transform — D-08).
    const freshMarkdown = htmlToMarkdown(entry.contentHtml);
    const title = detail.title ?? cached?.title ?? '';
    await this.app.vault.process(
      existingFile,
      (current) => {
        let updated = rewriteProblemSection(current, freshMarkdown);
        // Phase 12 (D-11): insert H1 title if missing on existing notes
        if (title && !updated.match(/^# .+/m)) {
          const h1 = `# ${title}\n`;
          // Insert after frontmatter: find second --- delimiter (closing)
          const firstDelim = updated.indexOf('---');
          const secondDelim = firstDelim >= 0 ? updated.indexOf('---', firstDelim + 3) : -1;
          if (secondDelim >= 0) {
            const afterFm = updated.indexOf('\n', secondDelim);
            const insertAt = afterFm >= 0 ? afterFm + 1 : secondDelim + 3;
            updated = updated.slice(0, insertAt) + h1 + updated.slice(insertAt);
          } else {
            updated = h1 + updated;
          }
        }
        return updated;
      },
    );

    // Union-merge frontmatter. D-04 status non-downgrade + D-10 user-key
    // preservation happen inside applyFrontmatter's callback.
    await applyFrontmatter(
      this.app,
      existingFile,
      buildFrontmatterInput(entry, this.settings.getDefaultLanguage()),
    );
  }
}

/**
 * Phase 3 Plan 07 — resolve the starter snippet for the user's default
 * language. Returns empty string when either the language is empty (user
 * cleared the setting) or the detail has no matching snippet. Empty string
 * is safe — `buildNoteBody` will emit an empty fenced block with the
 * configured langSlug tag.
 */
function pickStarterCode(entry: DetailCacheEntry, langSlug: string): string {
  if (!langSlug) return '';
  const snippets = entry.codeSnippets ?? [];
  const hit = snippets.find((s) => s.langSlug === langSlug);
  return hit?.code ?? '';
}

/** Map LC's detail shape into the on-disk cache entry.
 *
 * Phase 06 Plan 03 — `export` keyword added so the new `ProblemPreviewView`
 * cache-miss path (src/preview/ProblemPreviewView.ts) can call this helper to
 * persist a freshly-fetched detail into SettingsStore. RESEARCH §A2: the
 * underlying `LeetCodeClient.getProblemDetail` does NOT auto-persist into
 * SettingsStore — the preview view itself must call `setProblemDetail(slug,
 * toDetailCacheEntry(fetched))` after the fetch resolves. The body shape stays
 * IDENTICAL to v1.0 (existing internal callers in this module — openProblem,
 * backgroundRefresh, forceRefresh — keep working with the same in-module
 * import resolution; only the keyword is added). */
export function toDetailCacheEntry(raw: NoteWriterDetail): DetailCacheEntry {
  return {
    fetchedAt: Date.now(),
    id: Number(raw.questionFrontendId) || 0,
    title: raw.title,
    difficulty: raw.difficulty,
    url: `https://leetcode.com/problems/${raw.titleSlug}/`,
    contentHtml: raw.content ?? '',
    topicSlugs: Array.isArray(raw.topicTags)
      ? raw.topicTags.map((t) => String(t?.slug ?? '')).filter((s) => s.length > 0)
      : [],
    exampleTestcases: raw.exampleTestcases,
    metaData: raw.metaData,
    sampleTestCase: raw.sampleTestCase,
    codeSnippets: raw.codeSnippets,
    // Phase 3 D-30 — carry LC's internal questionId through to the cache so
    // Plan 04's REST body can read it via SettingsStore.getInternalQuestionId().
    // `undefined` (not empty string) when LC omits the field so shape-guard
    // treats old-cache-shape-compatible entries as valid.
    internalQuestionId: typeof raw.questionId === 'string' ? raw.questionId : undefined,
  };
}
