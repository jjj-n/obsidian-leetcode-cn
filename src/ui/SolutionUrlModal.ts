// src/ui/SolutionUrlModal.ts
// Ticket #09: Modal for inputting a solution URL

import { Modal, Setting } from 'obsidian';
import type { App } from 'obsidian';

/**
 * Modal for inputting a solution URL.
 * Ticket #09: 辅助路径 for solution picker UX.
 */
export class SolutionUrlModal extends Modal {
  private url: string = '';
  private onSubmit: (url: string) => void | Promise<void>;

  constructor(app: App, onSubmit: (url: string) => void | Promise<void>) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: '输入题解 URL' });
    contentEl.createEl('p', {
      text: '粘贴 leetcode.cn 题解 URL：',
      cls: 'solution-url-modal-description',
    });

    new Setting(contentEl)
      .setName('URL')
      .addText((text) =>
        text
          // eslint-disable-next-line obsidianmd/ui/sentence-case -- placeholder is a URL; capitalizing the host would make it invalid
          .setPlaceholder('粘贴题解 URL，如 https://leetcode.cn/problems/.../solutions/.../')
          .setValue(this.url)
          .onChange((value) => {
            this.url = value;
          }),
      );

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText('提交')
          .setCta()
          .onClick(() => {
            this.close();
            void this.onSubmit(this.url);
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
