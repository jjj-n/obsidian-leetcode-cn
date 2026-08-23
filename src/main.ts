// src/main.ts
// LeetCode CN for Obsidian — minimal plugin entry point.
//
// Fork of LikeSundayLikeRain/obsidian-leetcode (MIT), adapted for leetcode.cn.
// Workflow A (pure notebook mode): no Run/Submit inside Obsidian.
// The plugin fetches problems + user's AC code + community 题解 and writes
// them into Obsidian notes. See README.md ("Current status & Roadmap").
//
// This is a stripped-down version of the upstream main.ts. Features removed:
// - Inline widget (v1.3 CM6 editor) — not needed in workflow A
// - Run/Submit/judge polling — user codes on leetcode.cn directly
// - AI review/debug — v2 direction, not promised
// - Contest support — v2 direction, not promised
// - Knowledge graph / pattern classification — v2 direction, not promised
// - Problem preview view — folded into the problem-browser roadmap item
//
// The problem browser (src/browse/) is implemented but not wired to any
// command yet; wiring the `Fetch problem` command (NoteWriter.openProblem)
// is the current top roadmap item.

import { Notice, Plugin } from 'obsidian';
import type { MarkdownView, MarkdownFileInfo, TFile } from 'obsidian';
import { SettingsStore } from './settings/SettingsStore';
import { installRequestUrlFetcher } from './api/requestUrlFetcher';
import { LeetCodeClient } from './api/LeetCodeClient';
import { AuthService } from './auth/AuthService';
import { ProblemListService } from './browse/ProblemListService';
import { NoteWriter } from './notes/NoteWriter';
import { LeetCodeSettingTab } from './settings/SettingsTab';
import { pasteSanitize } from './notes/PasteSanitizer';
import { parseSolutionMarkers, findEmptySolutionAnchors, findNearestEmptySolutionAnchor, removeMarkers, updateAnchorUrl } from './notes/SolutionMarker';
import { SolutionUrlModal } from './ui/SolutionUrlModal';
import { FetchProblemModal } from './ui/FetchProblemModal';
import { RefreshScopeModal, type RefreshScope } from './ui/RefreshScopeModal';
import { parseAnchors, type AnchorRegion } from './notes/AnchorParser';
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
      name: 'Log in',
      callback: () => { void this.auth.login(); },
    });

    // Core loop — fetch a problem (URL, slug, or Chinese-title search) into a
    // note via the NoteWriter.openProblem pipeline (re-opens existing notes,
    // fetches and writes new ones; all failure modes surface as Notices inside it).
    this.addCommand({
      id: 'fetch-problem',
      name: 'Fetch problem',
      callback: () => {
        new FetchProblemModal(
          this.app,
          (slug) => {
            void this.notes.openProblem(slug);
          },
          // Non-slug input (Chinese titles, keywords, bare numbers) → cn
          // server-side searchKeywords; hits open in the picker modal.
          (query) => this.client.searchCNProblems(query, 20),
        ).open();
      },
    });

    // Ticket #04 — paste-sanitize command.
    this.addCommand({
      id: 'paste-sanitize',
      name: 'Paste sanitize: clean and convert HTML to markdown',
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
      name: 'Log out',
      callback: async () => {
        await this.auth.logout();
        new Notice('已登出。', 3000);
      },
    });

    // Ticket #09 — solution picker UX: marker absorption + modal input.

    // Helper to validate file and find empty anchors
    const validateAndGetEmptyAnchors = (
      editor: { getValue(): string },
      view: MarkdownView | MarkdownFileInfo,
    ): { file: TFile; emptyAnchors: AnchorRegion[] } | null => {
      const file = view.file;
      if (!file) {
        new Notice('没有活动文件。', 3000);
        return null;
      }

      const content = editor.getValue();
      const emptyAnchors = findEmptySolutionAnchors(content);
      if (emptyAnchors.length === 0) {
        new Notice('未找到空题解锚点。请先添加一个空的 <!-- lc:solution --> 锚点。', 4000);
        return null;
      }

      return { file, emptyAnchors };
    };

    this.addCommand({
      id: 'absorb-solution-markers',
      name: '吸收题解标记',
      editorCallback: async (editor, view) => {
        const validation = validateAndGetEmptyAnchors(editor, view);
        if (!validation) return;

        const { file } = validation;
        const content = editor.getValue();
        const markers = parseSolutionMarkers(content);

        if (markers.length === 0) {
          new Notice('未找到题解标记。请添加类似"题解链接: <URL>"的行。', 4000);
          return;
        }

        let processed = 0;
        let updatedContent = content;

        // Process each marker, using precomputed empty anchors for efficiency
        for (const marker of markers) {
          // Find nearest empty anchor to this marker
          const anchor = findNearestEmptySolutionAnchor(updatedContent, marker.lineNumber, validation.emptyAnchors);
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

        // Update file using vault.process (the only mutation primitive per CLAUDE.md)
        await this.app.vault.process(file, () => updatedContent);

        if (processed > 0) {
          new Notice(`已吸收 ${processed} 个题解标记。`, 3000);
        } else {
          new Notice('无法处理任何题解。', 4000);
        }
      },
    });

    this.addCommand({
      id: 'input-solution-url',
      name: '输入题解 URL',
      editorCallback: (editor, view) => {
        const validation = validateAndGetEmptyAnchors(editor, view);
        if (!validation) return;

        const { file, emptyAnchors } = validation;
        const content = editor.getValue();

        // Open modal for URL input
        new SolutionUrlModal(this.app, async (url) => {
          if (!url) return;

          // Find first empty anchor
          const anchor = emptyAnchors[0];
          if (!anchor) return;

          // Update anchor with URL
          let updatedContent = updateAnchorUrl(content, anchor, url);

          // Update file using vault.process (the only mutation primitive per CLAUDE.md)
          await this.app.vault.process(file, () => updatedContent);

          // Trigger solution refresh
          try {
            await this.notes.refreshSolution(file, anchor.params.slug || '', url);
            new Notice('题解添加成功。', 3000);
          } catch (err) {
            logger.debug('input-solution-url: refresh failed', err);
            new Notice('获取题解失败。请检查 URL 并重试。', 4000);
          }
        }).open();
      },
    });

    // Ticket #10 — refresh command with scope selection.
    this.addCommand({
      id: 'refresh-solutions',
      name: '刷新题解',
      editorCallback: (editor, view) => {
        const file = view.file;
        if (!file) {
          new Notice('没有活动文件。', 3000);
          return;
        }

        new RefreshScopeModal(this.app, async (scope: RefreshScope) => {
          const cursor = editor.getCursor();
          const cursorOffset = editor.posToOffset(cursor);

          if (scope === 'single') {
            await this.notes.refreshSingleAnchor(file, cursorOffset);
            new Notice('已刷新选定锚点。', 3000);
          } else if (scope === 'problem') {
            // Determine slug from cursor position
            const content = editor.getValue();
            const anchors = parseAnchors(content);
            const nearest = anchors.reduce((closest, anchor) => {
              const anchorMid = (anchor.startOffset + anchor.endOffset) / 2;
              const closestMid = (closest.startOffset + closest.endOffset) / 2;
              return Math.abs(anchorMid - cursorOffset) < Math.abs(closestMid - cursorOffset)
                ? anchor : closest;
            });
            const slug = nearest.params.slug;
            if (!slug) {
              new Notice('无法确定当前题目的 slug。', 4000);
              return;
            }
            await this.notes.refreshProblemAnchors(file, slug);
          } else if (scope === 'note') {
            await this.notes.refreshAllNoteAnchors(file);
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
