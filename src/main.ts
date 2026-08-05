// src/main.ts
// LeetCode CN for Obsidian — minimal plugin entry point.
//
// Fork of LikeSundayLikeRain/obsidian-leetcode (MIT), adapted for leetcode.cn.
// Workflow A (pure notebook mode): no Run/Submit inside Obsidian.
// The plugin fetches problems + user's AC code + community 题解 and writes
// them into Obsidian notes. See .planning/specs/cn-support-spec-final.md.
//
// This is a stripped-down version of the upstream main.ts. Features removed:
// - Inline widget (v1.3 CM6 editor) — not needed in workflow A
// - Run/Submit/judge polling — user codes on leetcode.cn directly
// - AI review/debug — deferred to v2
// - Contest support — deferred to v2
// - Knowledge graph / pattern classification — deferred to v2
// - Problem preview view — deferred to cn implementation
//
// These will be re-added as part of cn implementation tickets, or skipped
// entirely if they don't fit the cn-only notebook model.

import { Notice, Plugin, Modal, Setting } from 'obsidian';
import type { MarkdownView, App } from 'obsidian';
import { SettingsStore } from './settings/SettingsStore';
import { installRequestUrlFetcher } from './api/requestUrlFetcher';
import { LeetCodeClient } from './api/LeetCodeClient';
import { AuthService } from './auth/AuthService';
import { ProblemListService } from './browse/ProblemListService';
import { NoteWriter } from './notes/NoteWriter';
import { LeetCodeSettingTab } from './settings/SettingsTab';
import { pasteSanitize } from './notes/PasteSanitizer';
import { parseSolutionMarkers, findEmptySolutionAnchors, findNearestEmptySolutionAnchor, removeMarkers, updateAnchorUrl } from './notes/SolutionMarker';
import { logger } from './shared/logger';

export default class LeetCodePlugin extends Plugin {
  lcSettings!: SettingsStore;
  client!: LeetCodeClient;
  auth!: AuthService;
  list!: ProblemListService;
  notes!: NoteWriter;

  async onload(): Promise<void> {
    // Step 1 — load persisted settings (cookies, folder, language, index).
    this.lcSettings = await SettingsStore.load(this);

    // Step 2 — install requestUrl fetcher BEFORE any LC construction.
    // @leetnotion/leetcode-api's Credential.init() fires an eager fetch;
    // if our shim isn't in place yet, that call hits cross-fetch directly
    // and CORS-fails (RESEARCH.md Pitfall 1).
    installRequestUrlFetcher();

    // Step 3 — construct LC client. Must come BEFORE AuthService because
    // AuthService's two-arg constructor takes the client (BLOCKER 2).
    this.client = new LeetCodeClient(this.lcSettings);
    // If cookies were persisted from a prior run, reauthenticate NOW so the
    // client's Credential is fully initialised before any feature code issues
    // an API call. Swallow transient failures — next API call will surface
    // the logged-out state via isSessionExpired.
    await this.client.reauthenticate().catch(() => undefined);

    // Step 4 — auth service orchestrates login/logout. TWO-ARG constructor.
    this.auth = new AuthService(this.lcSettings, this.client);

    // Step 5 — list service (depends on client + settings).
    this.list = new ProblemListService(this.client, this.lcSettings);

    // Step 6 — note writer (depends on app + client + settings).
    // Structural types: NoteWriterClient and NoteWriterSettings.
    this.notes = new NoteWriter(this.app, this.client, this.lcSettings);
    this.notes.setLogin(() => { void this.auth.login(); });

    // Step 7 — settings tab.
    this.addSettingTab(new LeetCodeSettingTab(this.app, this));

    // Step 8 — basic commands.
    this.addCommand({
      id: 'login',
      name: 'Log in to LeetCode CN',
      callback: () => { void this.auth.login(); },
    });

    // Ticket #04 — paste-sanitize command.
    this.addCommand({
      id: 'paste-sanitize',
      name: 'Paste sanitize: clean and convert HTML to Markdown',
      editorCallback: (editor, view) => {
        const sel = editor.getSelection();
        if (sel) {
          try {
            const md = pasteSanitize(sel);
            editor.replaceSelection(md);
            new Notice('Paste sanitized.', 2000);
          } catch (err) {
            logger.debug('paste-sanitize: failed', err);
            new Notice('Could not sanitize the selected content.', 4000);
          }
        } else {
          // No selection: act on full content.
          const full = editor.getValue();
          if (full) {
            try {
              const md = pasteSanitize(full);
              editor.setValue(md);
              new Notice('Full document sanitized.', 2000);
            } catch (err) {
              logger.debug('paste-sanitize: failed on full doc', err);
              new Notice('Could not sanitize the document.', 4000);
            }
          } else {
            new Notice('Nothing to sanitize.', 2000);
          }
        }
      },
    });

    this.addCommand({
      id: 'logout',
      name: 'Log out of LeetCode CN',
      callback: async () => {
        await this.auth.logout();
        new Notice('LeetCode CN: logged out.', 3000);
      },
    });

    // Ticket #09 — solution picker UX: marker absorption + modal input.
    this.addCommand({
      id: 'absorb-solution-markers',
      name: 'Absorb solution markers',
      editorCallback: async (editor, view) => {
        const file = view.file;
        if (!file) {
          new Notice('No active file.', 3000);
          return;
        }

        const content = editor.getValue();
        const markers = parseSolutionMarkers(content);

        if (markers.length === 0) {
          new Notice('No solution markers found. Add lines like "题解链接: <URL>".', 4000);
          return;
        }

        const emptyAnchors = findEmptySolutionAnchors(content);
        if (emptyAnchors.length === 0) {
          new Notice('No empty solution anchors found. Add an empty <!-- lc:solution --> anchor first.', 4000);
          return;
        }

        let processed = 0;
        let updatedContent = content;

        // Process each marker
        for (const marker of markers) {
          // Find nearest empty anchor to this marker
          const anchor = findNearestEmptySolutionAnchor(updatedContent, marker.lineNumber);
          if (!anchor) {
            continue;
          }

          // Update anchor with URL
          updatedContent = updateAnchorUrl(updatedContent, anchor, marker.url);

          // Trigger solution refresh
          try {
            await this.notes.refreshSolution(file, anchor.params.slug || '', marker.url);
            processed++;
          } catch (err) {
            logger.debug('absorb-solution-markers: refresh failed', err);
            // Continue processing other markers even if one fails
          }
        }

        // Remove processed marker lines
        updatedContent = removeMarkers(updatedContent, markers);

        // Update file
        await editor.setValue(updatedContent);

        if (processed > 0) {
          new Notice(`Absorbed ${processed} solution marker(s).`, 3000);
        } else {
          new Notice('No solutions could be processed.', 4000);
        }
      },
    });

    this.addCommand({
      id: 'input-solution-url',
      name: 'Input solution URL',
      editorCallback: (editor, view) => {
        const file = view.file;
        if (!file) {
          new Notice('No active file.', 3000);
          return;
        }

        const content = editor.getValue();
        const emptyAnchors = findEmptySolutionAnchors(content);

        if (emptyAnchors.length === 0) {
          new Notice('No empty solution anchors found. Add an empty <!-- lc:solution --> anchor first.', 4000);
          return;
        }

        // Open modal for URL input
        new SolutionUrlModal(this.app, async (url) => {
          if (!url) return;

          // Find first empty anchor
          const anchor = emptyAnchors[0];
          if (!anchor) return;

          // Update anchor with URL
          let updatedContent = updateAnchorUrl(content, anchor, url);

          // Update file
          await editor.setValue(updatedContent);

          // Trigger solution refresh
          try {
            await this.notes.refreshSolution(file, anchor.params.slug || '', url);
            new Notice('Solution added successfully.', 3000);
          } catch (err) {
            logger.debug('input-solution-url: refresh failed', err);
            new Notice('Failed to fetch solution. Check the URL and try again.', 4000);
          }
        }).open();
      },
    });

    logger.info('[leetcode-cn] plugin loaded');
  }

  onunload(): void {
    logger.info('[leetcode-cn] plugin unloaded');
  }

}

/**
 * Modal for inputting a solution URL.
 * Ticket #09:辅助路径 for solution picker UX.
 */
class SolutionUrlModal extends Modal {
  private url: string = '';
  private onSubmit: (url: string) => void;

  constructor(app: App, onSubmit: (url: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Input Solution URL' });
    contentEl.createEl('p', {
      text: 'Paste a leetcode.cn solution URL:',
      cls: 'solution-url-modal-description',
    });

    new Setting(contentEl)
      .setName('URL')
      .addText((text) =>
        text
          .setPlaceholder('https://leetcode.cn/problems/.../solutions/.../')
          .setValue(this.url)
          .onChange((value) => {
            this.url = value;
          }),
      );

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText('Submit')
          .setCta()
          .onClick(() => {
            this.close();
            this.onSubmit(this.url);
          }),
      )
      .addButton((btn) =>
        btn.setButtonText('Cancel').onClick(() => {
          this.close();
        }),
      );
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
