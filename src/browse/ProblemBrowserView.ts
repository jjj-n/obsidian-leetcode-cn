// src/browse/ProblemBrowserView.ts
// The problem browser — this plugin's first (and only) ItemView. Renders the
// cached full-problemset index (ProblemListService) as a scrollable card list
// with a search box, difficulty/status quick chips, the compound FilterModal,
// and a per-row click → NoteWriter.openProblem (creates or reveals the note).
//
// Rendering strategy: slice + scroll-append (DISPLAY_STEP rows at a time), NOT
// virtual scrolling — Obsidian's own file explorer works the same way and the
// filter pass that precedes rendering costs more than the row DOM itself.
//
// All decision logic is factored into exported pure helpers (applyViewPipeline,
// nearBottom, formatIndexAge, countActiveRules, collectTopicSlugs) so tests
// run without an Obsidian workspace (filterProblems / classifyFetchInput
// precedent). The view class itself is thin DOM assembly only.
import { ItemView, Notice, setIcon } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import type { CompoundFilter, FilterRule, SettingsStore } from '../settings/SettingsStore';
import { logger } from '../shared/logger';
import type { ProblemListService, RefreshProgress } from './ProblemListService';
import { FilterModal } from './FilterModal';
import { DIFFICULTY_CN, displayId, displayTitle } from './types';
import type { IndexedProblem } from './types';

export const PROBLEM_BROWSER_VIEW_TYPE = 'leetcode-problem-browser';
export const DISPLAY_STEP = 100;

/** Structural injection (NoteWriter precedent) — tests never construct the view. */
export interface ProblemBrowserDeps {
  list: Pick<ProblemListService, 'refresh' | 'search' | 'filter' | 'applyCompoundFilter'>;
  notes: {
    openProblem(slug: string, status?: 'solved' | 'attempted' | 'untouched'): Promise<void>;
  };
  settings: Pick<SettingsStore, 'getFilter' | 'setFilter' | 'getUsername' | 'getProblemIndex'>;
}

/** Quick-chip view state — transient, NOT persisted (the compound filter is). */
export interface BrowserViewState {
  term: string;
  difficulty: string[];
  status: string[];
}

export const EMPTY_VIEW_STATE: BrowserViewState = { term: '', difficulty: [], status: [] };

/** The view's filter pipeline, in order: search term → quick chips → persisted
 *  compound filter. Chips and compound both optional; each stage passes through
 *  untouched when its input is empty. */
export function applyViewPipeline(
  list: ProblemBrowserDeps['list'],
  idx: IndexedProblem[],
  view: BrowserViewState,
  compound: CompoundFilter | null,
): IndexedProblem[] {
  let out = list.search(idx, view.term);
  if (view.difficulty.length > 0 || view.status.length > 0) {
    out = list.filter(out, { difficulty: view.difficulty, status: view.status });
  }
  return list.applyCompoundFilter(out, compound);
}

/** True when a scroll container is within `threshold` px of its bottom —
 *  the trigger for appending another DISPLAY_STEP slice. */
export function nearBottom(
  el: { scrollTop: number; scrollHeight: number; clientHeight: number },
  threshold = 200,
): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

/** Human-friendly age for the footer ("3 小时前更新"). Pure — `now` injectable. */
export function formatIndexAge(fetchedAt: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - fetchedAt) / 1000));
  if (s < 60) return '刚刚';
  const m = Math.floor(s / 60);
  if (m < 60) return `${String(m)} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${String(h)} 小时前`;
  return `${String(Math.floor(h / 24))} 天前`;
}

/** A rule counts toward the filter badge only when it actually prunes rows —
 *  mirrors evaluateRule's no-op semantics (empty values / null range bounds). */
function ruleIsActive(r: FilterRule): boolean {
  switch (r.field) {
    case 'status':
    case 'difficulty':
    case 'topics':
    case 'premium':
      return r.values.length > 0;
    case 'question-id':
    case 'acceptance':
      return r.min !== null || r.max !== null;
  }
}

/** Number of user-visible active rules — drives the filter button's badge. */
export function countActiveRules(f: CompoundFilter | null): number {
  if (!f) return 0;
  return f.rules.filter(ruleIsActive).length;
}

/** Sorted unique topic slugs across the index — FilterModal's topic picker data. */
export function collectTopicSlugs(idx: IndexedProblem[]): string[] {
  const set = new Set<string>();
  for (const p of idx) {
    for (const t of p.topics ?? []) set.add(t);
  }
  return [...set].sort();
}

const DIFF_CHIPS: { value: 'Easy' | 'Medium' | 'Hard'; label: string }[] = [
  { value: 'Easy', label: '简单' },
  { value: 'Medium', label: '中等' },
  { value: 'Hard', label: '困难' },
];

const STATUS_CHIPS: { value: 'solved' | 'attempted' | 'untouched'; label: string }[] = [
  { value: 'solved', label: '已解决' },
  { value: 'attempted', label: '尝试过' },
  { value: 'untouched', label: '未开始' },
];

export class ProblemBrowserView extends ItemView {
  private readonly deps: ProblemBrowserDeps;
  private all: IndexedProblem[] = [];
  private state: BrowserViewState = { ...EMPTY_VIEW_STATE };
  private renderedCount = DISPLAY_STEP;
  private visibleCount = 0;
  private fetchedAt: number | null = null;
  private phase: 'idle' | 'refreshing' | 'ready' | 'error' = 'idle';

  // Element refs — all inside contentEl, emptied in onClose.
  private rootEl: HTMLElement | null = null;
  private progressEl: HTMLElement | null = null;
  private progressFillEl: HTMLElement | null = null;
  private progressLabelEl: HTMLElement | null = null;
  private chipsEl: HTMLElement | null = null;
  private rowsEl: HTMLElement | null = null;
  private footerEl: HTMLElement | null = null;
  private filterBadgeEl: HTMLElement | null = null;
  private searchInputEl: HTMLInputElement | null = null;

  constructor(leaf: WorkspaceLeaf, deps: ProblemBrowserDeps) {
    super(leaf);
    this.deps = deps;
  }

  getViewType(): string {
    return PROBLEM_BROWSER_VIEW_TYPE;
  }

  getDisplayText(): string {
    return '题目浏览器';
  }

  getIcon(): string {
    return 'list-checks';
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.rootEl = this.contentEl.createDiv({ cls: 'leetcode-browser' });
    this.buildProgress();
    this.buildTopbar();
    this.buildChips();
    this.rowsEl = this.rootEl.createDiv({ cls: 'lc-rows' });
    this.footerEl = this.rootEl.createDiv({ cls: 'lc-footer' });
    // Scroll-append: .leetcode-browser is its own scroll container (styles.css).
    this.registerDomEvent(this.rootEl, 'scroll', () => {
      if (this.phase === 'ready' && this.rootEl && nearBottom(this.rootEl)) {
        if (this.renderedCount < this.visibleCount) {
          this.renderedCount += DISPLAY_STEP;
          this.renderList();
        }
      }
    });
    this.updateFilterBadge();
    this.renderList();
    this.renderFooter();
    // Cold open: cache hit → refresh() emits one terminal tick with the cached
    // rows (no progress-bar flash); stale/empty → paginated fetch with ticks.
    void this.runRefresh(false);
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
    this.rootEl = null;
    this.chipsEl = null;
    this.rowsEl = null;
    this.footerEl = null;
    this.progressEl = null;
    this.progressFillEl = null;
    this.progressLabelEl = null;
    this.filterBadgeEl = null;
    this.searchInputEl = null;
  }

  // ── Construction ───────────────────────────────────────────────────────────

  private buildProgress(): void {
    if (!this.rootEl) return;
    this.progressEl = this.rootEl.createDiv({ cls: 'lc-progress is-hidden' });
    const track = this.progressEl.createDiv({ cls: 'lc-progress__track' });
    this.progressFillEl = track.createDiv({ cls: 'lc-progress__fill' });
    this.progressLabelEl = this.progressEl.createDiv({ cls: 'lc-progress__label' });
  }

  private buildTopbar(): void {
    if (!this.rootEl) return;
    const bar = this.rootEl.createDiv({ cls: 'lc-topbar' });

    const search = bar.createDiv({ cls: 'lc-search' });
    const sIcon = search.createSpan({ cls: 'lc-search__icon' });
    setIcon(sIcon, 'search');
    this.searchInputEl = search.createEl('input', {
      attr: {
        type: 'text',
        placeholder: '搜索题号 / 题名 / slug…',
        'aria-label': '搜索题目',
      },
    });
    this.registerDomEvent(this.searchInputEl, 'input', () => {
      this.state.term = this.searchInputEl?.value ?? '';
      this.renderedCount = DISPLAY_STEP;
      this.renderList();
      this.renderFooter();
    });

    const filterBtn = bar.createDiv({
      cls: 'lc-iconbtn',
      attr: { role: 'button', tabindex: '0', 'aria-label': '高级筛选' },
    });
    const fIcon = filterBtn.createSpan({ cls: 'lc-iconbtn__icon' });
    setIcon(fIcon, 'filter');
    this.filterBadgeEl = filterBtn.createSpan({ cls: 'lc-iconbtn__badge' });
    const openFilter = (): void => this.openFilterModal();
    filterBtn.addEventListener('click', openFilter);
    filterBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openFilter();
      }
    });

    const refreshBtn = bar.createDiv({
      cls: 'lc-iconbtn',
      attr: { role: 'button', tabindex: '0', 'aria-label': '刷新题库索引' },
    });
    const rIcon = refreshBtn.createSpan({ cls: 'lc-iconbtn__icon' });
    setIcon(rIcon, 'rotate-ccw');
    const doRefresh = (): void => { void this.runRefresh(true); };
    refreshBtn.addEventListener('click', doRefresh);
    refreshBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        doRefresh();
      }
    });
  }

  private buildChips(): void {
    if (!this.rootEl) return;
    this.chipsEl = this.rootEl.createDiv({ cls: 'lc-chips' });
    this.renderChips();
  }

  private renderChips(): void {
    if (!this.chipsEl) return;
    this.chipsEl.empty();
    const toggle = (group: 'difficulty' | 'status', value: string): void => {
      const arr = this.state[group];
      const i = arr.indexOf(value);
      if (i >= 0) arr.splice(i, 1);
      else arr.push(value);
      this.renderedCount = DISPLAY_STEP;
      this.renderChips();
      this.renderList();
      this.renderFooter();
    };
    const mkChip = (group: 'difficulty' | 'status', value: string, label: string): void => {
      const active = this.state[group].includes(value);
      const chip = this.chipsEl!.createSpan({
        cls: `lc-chip${active ? ' is-active' : ''}`,
        text: label,
        attr: { role: 'button', tabindex: '0' },
      });
      if (group === 'difficulty') chip.addClass(`lc-diff--${value.toLowerCase()}`);
      chip.addEventListener('click', () => toggle(group, value));
      chip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle(group, value);
        }
      });
    };
    for (const c of DIFF_CHIPS) mkChip('difficulty', c.value, c.label);
    this.chipsEl.createSpan({ cls: 'lc-chip-sep' });
    for (const c of STATUS_CHIPS) mkChip('status', c.value, c.label);
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  private renderList(): void {
    if (!this.rowsEl) return;
    this.rowsEl.empty();

    if (this.phase === 'error') {
      this.visibleCount = 0;
      this.rowsEl.createDiv({ cls: 'lc-empty', text: '同步题库失败——网络或登录状态问题。' });
      const retry = this.rowsEl.createEl('button', { text: '重试' });
      retry.addEventListener('click', () => { void this.runRefresh(true); });
      return;
    }

    const compound = this.deps.settings.getFilter();
    const visible = applyViewPipeline(this.deps.list, this.all, this.state, compound);
    this.visibleCount = visible.length;

    if (this.all.length === 0) {
      this.rowsEl.createDiv({
        cls: 'lc-empty',
        text: this.phase === 'refreshing'
          ? '正在同步题库…（首次约需一分钟）'
          : '题库索引为空——点击右上角刷新按钮同步。',
      });
      return;
    }
    if (visible.length === 0) {
      this.rowsEl.createDiv({ cls: 'lc-empty', text: '没有符合当前筛选的题目。' });
      return;
    }

    const shown = visible.slice(0, this.renderedCount);
    for (const p of shown) this.renderRow(p);
    if (shown.length < visible.length) {
      this.rowsEl.createDiv({ cls: 'lc-more-hint', text: '向下滚动载入更多…' });
    }
  }

  private renderRow(p: IndexedProblem): void {
    if (!this.rowsEl) return;
    const status = p.status ?? 'untouched';
    const row = this.rowsEl.createDiv({
      cls: `lc-row${status === 'solved' ? ' lc-row--solved' : ''}`,
      attr: { role: 'button', tabindex: '0' },
    });
    const st = row.createSpan({
      cls: `lc-row__status lc-row__status--${p.paid ? 'paid' : status}`,
    });
    setIcon(st, p.paid ? 'lock'
      : status === 'solved' ? 'check-circle'
      : status === 'attempted' ? 'circle-dashed'
      : 'circle');

    const titleBlock = row.createDiv({ cls: 'lc-row__titleblock' });
    titleBlock.createSpan({ cls: 'lc-row__id', text: `${displayId(p)}.` });
    titleBlock.createSpan({ cls: 'lc-row__title', text: displayTitle(p) });

    const meta = row.createSpan({ cls: 'lc-row__meta' });
    if (typeof p.acRate === 'number') {
      meta.createSpan({ cls: 'lc-row__acrate', text: `${p.acRate.toFixed(1)}%` });
    }
    meta.createSpan({
      cls: `lc-row__diff lc-diff--${p.diff.toLowerCase()}`,
      text: DIFFICULTY_CN[p.diff],
    });

    const open = (): void => { void this.deps.notes.openProblem(p.slug, p.status); };
    row.addEventListener('click', open);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') open();
    });
  }

  private renderFooter(): void {
    if (!this.footerEl) return;
    this.footerEl.empty();
    if (this.all.length === 0) return;

    const parts: string[] = [`共 ${String(this.all.length)} 题`];
    if (this.visibleCount !== this.all.length) {
      parts.push(`筛选后 ${String(this.visibleCount)} 题`);
    }
    if (this.fetchedAt !== null) parts.push(`${formatIndexAge(this.fetchedAt)}更新`);
    this.footerEl.setText(parts.join(' · '));

    if (this.deps.settings.getUsername() === null) {
      this.footerEl.createDiv({
        cls: 'lc-footer__hint',
        text: '未登录：AC 状态不可见（全部显示为未开始），登录后刷新即可。',
      });
    }
  }

  // ── Refresh / progress ─────────────────────────────────────────────────────

  private showProgress(loaded: number, total: number | null): void {
    if (!this.progressEl || !this.progressFillEl || !this.progressLabelEl) return;
    this.progressEl.removeClass('is-hidden');
    if (total === null) {
      this.progressEl.addClass('is-indeterminate');
      this.progressLabelEl.setText(`正在同步题库… 已载入 ${String(loaded)} 题`);
    } else {
      this.progressEl.removeClass('is-indeterminate');
      const pct = total > 0 ? Math.min(100, (loaded / total) * 100) : 100;
      this.progressFillEl.style.width = `${String(pct.toFixed(1))}%`;
      this.progressLabelEl.setText(`正在同步题库… ${String(loaded)} / ${String(total)}`);
    }  }

  private hideProgress(): void {
    if (!this.progressEl) return;
    this.progressEl.addClass('is-hidden');
    this.progressEl.removeClass('is-indeterminate');
  }

  private async runRefresh(force: boolean): Promise<void> {
    if (this.phase === 'refreshing') return;
    this.phase = 'refreshing';
    // Start from an empty list: a cache-hit refresh() emits ONE terminal tick
    // whose `rows` is the full cached list, so concat works for both shapes.
    this.all = [];
    this.renderedCount = DISPLAY_STEP;
    this.renderList();
    this.renderFooter();
    try {
      const onTick = (tick: RefreshProgress): void => {
        this.all = this.all.concat(tick.rows);
        if (tick.done) this.hideProgress();
        else this.showProgress(tick.loaded, tick.total);
        this.renderList();
        this.renderFooter();
      };
      const result = await this.deps.list.refresh(force, onTick);
      this.all = result;
      this.fetchedAt = this.deps.settings.getProblemIndex()?.fetchedAt ?? Date.now();
      this.phase = 'ready';
      this.hideProgress();
      this.renderedCount = DISPLAY_STEP;
      this.renderList();
      this.renderFooter();
    } catch (err) {
      logger.debug('problem-browser: refresh failed', err);
      this.phase = 'error';
      this.hideProgress();
      new Notice('同步题库失败，请稍后重试。', 4000);
      this.renderList();
      this.renderFooter();
    }
  }

  // ── Compound filter ────────────────────────────────────────────────────────

  private openFilterModal(): void {
    new FilterModal(
      this.app,
      this.deps.settings.getFilter(),
      collectTopicSlugs(this.all),
      (f) => {
        // setFilter mutates the in-memory store synchronously before persisting,
        // so getFilter() below already observes the applied value.
        void this.deps.settings.setFilter(f);
        this.renderedCount = DISPLAY_STEP;
        this.updateFilterBadge();
        this.renderList();
        this.renderFooter();
      },
    ).open();
  }

  private updateFilterBadge(): void {
    if (!this.filterBadgeEl) return;
    const n = countActiveRules(this.deps.settings.getFilter());
    this.filterBadgeEl.setText(String(n));
    if (n > 0) this.filterBadgeEl.addClass('is-visible');
    else this.filterBadgeEl.removeClass('is-visible');
  }
}
