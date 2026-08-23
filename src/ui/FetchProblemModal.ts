// src/ui/FetchProblemModal.ts
// Core-loop command: fetch a leetcode.cn problem into a note.
// Thin input layer — all fetching/writing is owned by NoteWriter.openProblem.
//
// Input routing (classifyFetchInput): a leetcode URL or slug-shaped input goes
// straight to onSubmit; everything else non-empty (Chinese titles, English
// keywords with spaces, bare numbers like "70") becomes a server-side search
// query — when an onSearch handler is wired, results open in
// ProblemSearchResultModal and the picked slug flows into the same onSubmit.

import { Modal, Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';
import type { CNProblemSearchHit } from '../api/LeetCodeCNAdapter';
import { ProblemSearchResultModal } from './ProblemSearchResultModal';

/**
 * Extract a problem slug from user input.
 *
 * Accepts either a leetcode.cn / leetcode.com problem URL (any subpath —
 * `/description/`, `/solutions/…` all work; the host is lenient because the
 * two sites share slugs for most problems) or a bare slug like `two-sum`.
 * Returns the lowercased slug, or null when the input matches neither form.
 */
export function parseProblemSlug(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const urlMatch = /leetcode\.(?:cn|com)\/problems\/([a-z0-9-]+)/i.exec(trimmed);
  if (urlMatch?.[1]) return urlMatch[1].toLowerCase();

  if (/^[a-z0-9][a-z0-9-]*$/i.test(trimmed)) return trimmed.toLowerCase();

  return null;
}

/** Where a Fetch-problem input should go. Pure — unit-tested directly. */
export type FetchInputRoute =
  | { kind: 'empty' }
  | { kind: 'slug'; slug: string }
  | { kind: 'search'; query: string };

/**
 * Route a raw input:
 *   - URL / slug-shaped text → direct slug fetch (unchanged legacy behavior)
 *   - pure digits → search (LC slugs are never bare numbers; searching "70"
 *     finds 爬楼梯 #70, while slug-fetching "70" would just fail)
 *   - anything else non-empty → search (Chinese titles, "climbing stairs", …)
 */
export function classifyFetchInput(input: string): FetchInputRoute {
  const trimmed = input.trim();
  if (!trimmed) return { kind: 'empty' };
  if (/^\d+$/.test(trimmed)) return { kind: 'search', query: trimmed };
  const slug = parseProblemSlug(trimmed);
  if (slug) return { kind: 'slug', slug };
  return { kind: 'search', query: trimmed };
}

/**
 * Modal for inputting a problem URL, slug, or search keywords (Chinese
 * titles work). Slug-shaped input closes the modal and hands the parsed slug
 * to `onSubmit`; other input runs `onSearch` (when wired) and opens the
 * result picker. Unsearchable/unmatched input keeps the modal open with a
 * Notice.
 */
export class FetchProblemModal extends Modal {
  private value: string = '';
  private onSubmit: (slug: string) => void | Promise<void>;
  private readonly onSearch?: (query: string) => Promise<CNProblemSearchHit[]>;

  constructor(
    app: App,
    onSubmit: (slug: string) => void | Promise<void>,
    onSearch?: (query: string) => Promise<CNProblemSearchHit[]>,
  ) {
    super(app);
    this.onSubmit = onSubmit;
    this.onSearch = onSearch;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: '抓取题目' });
    contentEl.createEl('p', {
      text: '粘贴 leetcode.cn 题目链接、输入 slug，或直接输入题名搜索（支持中文，如：两数之和）：',
      cls: 'fetch-problem-modal-description',
    });

    new Setting(contentEl)
      .setName('题目')
      .addText((text) =>
        text
          .setPlaceholder('题目 URL、slug 或中文题名')
          .setValue(this.value)
          .onChange((value) => {
            this.value = value;
          }),
      );

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText('抓取')
          .setCta()
          .onClick(() => {
            void this.submit();
          }),
      )
      .addButton((btn) =>
        btn.setButtonText('取消').onClick(() => {
          this.close();
        }),
      );
  }

  private async submit(): Promise<void> {
    const route = classifyFetchInput(this.value);

    if (route.kind === 'empty') {
      new Notice('请输入题目链接、slug 或题名关键词。', 4000);
      return;
    }

    if (route.kind === 'slug') {
      this.close();
      void this.onSubmit(route.slug);
      return;
    }

    // Search path.
    if (!this.onSearch) {
      new Notice('无法识别题目。请粘贴 leetcode.cn 题目链接或输入 slug（如 two-sum）。', 4000);
      return;
    }
    let hits: CNProblemSearchHit[];
    try {
      hits = await this.onSearch(route.query);
    } catch {
      new Notice('搜索失败，请检查网络后重试。', 4000);
      return;
    }
    if (hits.length === 0) {
      new Notice(`没有找到与「${route.query}」匹配的题目。`, 4000);
      return;
    }
    this.close();
    new ProblemSearchResultModal(this.app, hits, (slug) => this.onSubmit(slug)).open();
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
