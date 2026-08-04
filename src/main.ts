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

import { Notice, Plugin } from 'obsidian';
import type { MarkdownView } from 'obsidian';
import { SettingsStore } from './settings/SettingsStore';
import { installRequestUrlFetcher } from './api/requestUrlFetcher';
import { LeetCodeClient } from './api/LeetCodeClient';
import { AuthService } from './auth/AuthService';
import { ProblemListService } from './browse/ProblemListService';
import { NoteWriter } from './notes/NoteWriter';
import { LeetCodeSettingTab } from './settings/SettingsTab';
import { pasteSanitize } from './notes/PasteSanitizer';
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

    logger.info('[leetcode-cn] plugin loaded');
  }

  onunload(): void {
    logger.info('[leetcode-cn] plugin unloaded');
  }

}
