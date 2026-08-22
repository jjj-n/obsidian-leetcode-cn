// src/ui/FetchProblemModal.ts
// Core-loop command: fetch a leetcode.cn problem into a note.
// Thin input layer — all fetching/writing is owned by NoteWriter.openProblem.

import { Modal, Notice, Setting } from 'obsidian';
import type { App } from 'obsidian';

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

/**
 * Modal for inputting a problem URL or slug. Submitting with unrecognizable
 * input keeps the modal open and shows a Notice; a valid input closes the
 * modal and hands the parsed slug to `onSubmit`.
 */
export class FetchProblemModal extends Modal {
  private value: string = '';
  private onSubmit: (slug: string) => void | Promise<void>;

  constructor(app: App, onSubmit: (slug: string) => void | Promise<void>) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: '抓取题目' });
    contentEl.createEl('p', {
      text: '粘贴 leetcode.cn 题目链接，或直接输入题目 slug：',
      cls: 'fetch-problem-modal-description',
    });

    new Setting(contentEl)
      .setName('题目')
      .addText((text) =>
        text
          .setPlaceholder('题目 URL 或 slug，如 two-sum')
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
            const slug = parseProblemSlug(this.value);
            if (!slug) {
              new Notice('无法识别题目。请粘贴 leetcode.cn 题目链接或输入 slug（如 two-sum）。', 4000);
              return;
            }
            this.close();
            void this.onSubmit(slug);
          }),
      )
      .addButton((btn) =>
        btn.setButtonText('取消').onClick(() => {
          this.close();
        }),
      );
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
