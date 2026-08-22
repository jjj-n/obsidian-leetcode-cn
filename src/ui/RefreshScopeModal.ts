// src/ui/RefreshScopeModal.ts
// Ticket 10: Refresh scope selection modal

import { Modal, Setting } from 'obsidian';
import type { App } from 'obsidian';

export type RefreshScope = 'single' | 'problem' | 'note';

/**
 * Modal for selecting refresh scope.
 * Ticket 10: 三选一刷新范围
 */
export class RefreshScopeModal extends Modal {
  private onSubmit: (scope: RefreshScope) => void | Promise<void>;

  constructor(app: App, onSubmit: (scope: RefreshScope) => void | Promise<void>) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: '选择刷新范围' });

    new Setting(contentEl)
      .setName('单锚点')
      .setDesc('仅刷新光标位置最近的锚点')
      .addButton((btn) =>
        btn.setButtonText('选择').setCta().onClick(() => {
          this.close();
          void this.onSubmit('single');
        }),
      );

    new Setting(contentEl)
      .setName('单题全部')
      .setDesc('刷新当前题的所有锚点（problem / code / solution / solution_approach）')
      .addButton((btn) =>
        btn.setButtonText('选择').setCta().onClick(() => {
          this.close();
          void this.onSubmit('problem');
        }),
      );

    new Setting(contentEl)
      .setName('整篇笔记')
      .setDesc('刷新笔记中所有锚点')
      .addButton((btn) =>
        btn.setButtonText('选择').setCta().onClick(() => {
          this.close();
          void this.onSubmit('note');
        }),
      );
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
