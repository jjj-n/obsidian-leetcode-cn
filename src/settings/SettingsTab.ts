// src/settings/SettingsTab.ts
// Phase 1 settings UI — D-09 layout verbatim; UI-SPEC.md copy + color rules LOCKED.
// All user-visible strings are LOCKED — paraphrasing is forbidden.
//
// Accent color (`var(--interactive-accent)` via the call-to-action modifier) is
// RESERVED for the primary `Log in via embedded window` button only
// (UI-SPEC.md § Color). Logout, Save cookies, and every other button in this
// file MUST remain neutral. Grep gate: exactly one invocation of the accent
// modifier in this file.
import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type LeetCodePlugin from '../main';
import type { AuthCookies } from '../auth/types';
import type { AIProvider, BedrockProviderConfig } from './SettingsStore';
// Phase 07 Plan 04 — single source of truth for provider display names; the
// local copy of `prettyName` was moved to src/ai/types.ts so main.ts (Notice
// copy) and SettingsTab.ts (sub-form) render identical brand strings without
// duplication. 07-UI-SPEC.md §"Copywriting Contract" remains the locked spec.
// Stubbed in cn fork — AI features removed in workflow A.
const prettyName = (p: AIProvider): string => String(p);

// Phase 07 Plan 03 — model placeholders per provider, locked by 07-UI-SPEC.md
// §"Copywriting Contract" (Model placeholders row).
//
// Phase 08.1 Plan 02 — Bedrock joins the exhaustive switch. The placeholder
// returns '' because Bedrock's per-provider sub-form replaces the generic
// "Model" row with a dedicated "Model ID" row inside renderAIProviderForm's
// `case 'bedrock'` branch (the generic Model row is hidden when active is
// 'bedrock'). The placeholder is referenced by the generic Model row only,
// so the empty string here never reaches a UI surface for Bedrock.
function modelPlaceholder(p: AIProvider): string {
  switch (p) {
    case 'anthropic': return 'claude-haiku-4-5';
    case 'openai': return 'gpt-5-mini';
    case 'openrouter': return 'anthropic/claude-haiku-4.5';
    case 'ollama': return 'llama3.2';
    case 'custom': return '';
    case 'bedrock': return '';
    default: return '';
  }
}

// Phase 5.2 D-12 — mirrors LC's submission-language dropdown as of 2026-05-11.
// Keys = LC langSlug (the value LC accepts in /interpret_solution/ + /submit/ bodies);
// values = UI display labels. SQL dialects excluded — v1 scope is algorithm problems.
// Insertion order matches LC's own dropdown order and drives the rendered order
// because `Object.entries` preserves insertion order for string keys.
// Exported so tests/settings/SettingsTab.test.ts can pin the exact key set.
export const LANGUAGE_OPTIONS: Record<string, string> = {
  python3:    'Python3',
  python:     'Python',
  java:       'Java',
  cpp:        'C++',
  c:          'C',
  csharp:     'C#',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  php:        'PHP',
  swift:      'Swift',
  kotlin:     'Kotlin',
  dart:       'Dart',
  golang:     'Go',
  ruby:       'Ruby',
  scala:      'Scala',
  rust:       'Rust',
  racket:     'Racket',
  erlang:     'Erlang',
  elixir:     'Elixir',
};

export class LeetCodeSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: LeetCodePlugin) {
    super(app, plugin);
  }

  display(): void {
    this.renderTab();
  }

  // Internal re-render hook used by click handlers that need to refresh the
  // tab after mutating auth/settings state. Routing through a private method
  // (instead of `this.display()`) keeps every call site off the deprecated
  // `PluginSettingTab.display` symbol while preserving the framework's
  // public `display()` contract for the initial paint.
  private renderTab(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('leetcode-settings');

    // =============================
    //   Authentication section
    // =============================
    new Setting(containerEl).setName('Authentication').setHeading();

    const loggedIn = this.plugin.auth.isLoggedIn();
    const username = this.plugin.lcSettings.getUsername();
    const statusText = loggedIn
      ? `Logged in as ${username ?? '…'}`
      : 'Not logged in';

    // Phase 5.2 D-01 — Status row and primary auth button merged into a single
    // Setting. Name+Desc render on the left via Obsidian's built-in
    // `.setting-item-info` flex cell; the button renders on the right via
    // `.setting-item-control`. No custom CSS required.
    //
    // Accent-modifier grep gate preserved: exactly one invocation of the
    // call-to-action modifier in this file, on the logged-out Log-in branch.
    new Setting(containerEl)
      .setName('Status')
      .setDesc(statusText)
      .addButton((b) => {
        if (loggedIn) {
          // AUTH-05: immediate logout, no confirmation modal (UI-SPEC.md § Destructive actions).
          b.setButtonText('Logout')

            .setTooltip('Log out of LeetCode')
            .onClick(async () => {
              await this.plugin.auth.logout();
              this.renderTab();
            });
        } else {
          // Only button in this file that receives the call-to-action accent modifier.
          b.setButtonText('Log in via embedded window')
            .setCta()
            .onClick(async () => {
              await this.plugin.auth.login();
              this.renderTab();
            });
        }
      });

    // =============================
    //   Region setting (Ticket #1)
    // =============================
    new Setting(containerEl)
      .setName('Region')
      .setDesc('LeetCode site to connect to. leetcode.cn for Chinese users; leetcode.com for international.')
      .addDropdown((d) => d
        .addOption('cn', 'leetcode.cn')
        .addOption('com', 'leetcode.com')
        .setValue(this.plugin.lcSettings.getRegion())
        .onChange(async (v) => {
          await this.plugin.lcSettings.setRegion(v as 'com' | 'cn');
          new Notice(`Region changed to ${v === 'cn' ? 'leetcode.cn' : 'leetcode.com'}. Existing notes keep their original URLs; new notes will use this region.`, 5000);
        }),
      );

    // =============================
    //   Manual cookie (fallback) — D-05 first-class, inside Auth section per D-09
    // =============================
    let sessionVal = '';
    let csrfVal = '';

    new Setting(containerEl)
      .setName('Manual cookie (fallback)')
      .setDesc("Paste your LeetCode session cookies if the embedded login doesn't work on your system.")
      .setHeading()
      .addButton((b) => {
        b.setIcon('save')
          .setTooltip('Save cookies')
          .onClick(async () => {
            const session = sessionVal.trim();
            const csrf = csrfVal.trim();
            if (!session || !csrf) {
              new Notice('Both fields are required.', 3000);
              return;
            }
            const cookies: AuthCookies = {
              LEETCODE_SESSION: session,
              csrftoken: csrf,
            };
            await this.plugin.auth.loginManual(cookies);
            this.renderTab();
          });
        b.buttonEl.addClass('clickable-icon');
      });

    const cookieGroup = containerEl.createDiv('lc-settings-group');
    new Setting(cookieGroup)
      .setName('LEETCODE_SESSION')
      .addText((t) => {
        t.inputEl.type = 'password';
        t.inputEl.addClass('lc-cookie-input');
        t.onChange((v) => { sessionVal = v; });
      });

    new Setting(cookieGroup)
      .setName('csrftoken')
      .addText((t) => {
        t.inputEl.type = 'password';
        t.inputEl.addClass('lc-cookie-input');
        t.onChange((v) => { csrfVal = v; });
      });

    // =============================
    //   Notes section
    // =============================
    new Setting(containerEl).setName('Notes').setHeading();

    const notesGroup = containerEl.createDiv('lc-settings-group');
    new Setting(notesGroup)
      .setName('Problems folder')
      .setDesc('Vault folder where problem notes are created.')
      .addText((t) => t

        .setPlaceholder('LeetCode/')
        .setValue(this.plugin.lcSettings.getProblemsFolder())
        .onChange(async (v) => {
          // D-10: strip trailing slash on persist (stored without trailing slash).
          await this.plugin.lcSettings.setProblemsFolder(v.replace(/\/+$/, ''));
        }),
      );

    new Setting(notesGroup)
      .setName('Default language')
      .setDesc('Starter code language for new problems.')
      .addDropdown((d) => d
        .addOptions(LANGUAGE_OPTIONS)
        .setValue(this.plugin.lcSettings.getDefaultLanguage())
        .onChange(async (v) => {
          await this.plugin.lcSettings.setDefaultLanguage(v);
        }),
      );

    new Setting(notesGroup)
      .setName('Click behavior')
      .setDesc('What happens when you click a problem in the LeetCode browser. Shift-click always opens the note directly.')
      .addDropdown((d) => d
        .addOption('preview', 'Preview first')
        .addOption('open', 'Open note directly')
        .setValue(this.plugin.lcSettings.getPreviewClickBehavior())
        .onChange(async (v) => {
          await this.plugin.lcSettings.setPreviewClickBehavior(v as 'preview' | 'open');
        }),
      );

    // =============================
    //   Code editor section (Phase 16 INDENT-04 D-06)
    // =============================
    // User-visible override for the code-editor indent unit. 'auto' defers to
    // the per-language default (4 for Java/Python/C/C++/Rust, 2 for JS/TS,
    // tab for Go); a numeric literal forces that many spaces for every
    // language EXCEPT Go (gofmt non-negotiable; exception lives in the
    // consumer at childEditorLanguage.ts:effectiveIndent).
    //
    // Four-option dropdown using addOption(value, label) chain (NOT
    // addOptions Record literal) per the locked precedent for explicit-order
    // dropdowns in this file (Preview section). Dropdown values are strings
    // in Obsidian's API; coerce back to 'auto' | 2 | 4 | 8 in onChange.
    new Setting(containerEl).setName('Code editor').setHeading();

    const codeEditorGroup = containerEl.createDiv('lc-settings-group');
    new Setting(codeEditorGroup)
      .setName('Indent size')
      .setDesc('Number of spaces per indent level in the code editor. "Auto" uses the language default (4 for Java/Python/C++, 2 for JS/TS, tab for Go).')
      .addDropdown((d) => d
        .addOption('auto', 'Auto (language default)')
        .addOption('2', '2 spaces')
        .addOption('4', '4 spaces')
        .addOption('8', '8 spaces')
        .setValue(String(this.plugin.lcSettings.getIndentSizeOverride()))
        .onChange(async (v) => {
          const val: 'auto' | 2 | 4 | 8 =
            v === '2' ? 2 :
            v === '4' ? 4 :
            v === '8' ? 8 :
            'auto';
          await this.plugin.lcSettings.setIndentSizeOverride(val);
          // Live-apply: fan out to every mounted widget so the new
          // indent unit takes effect without needing to reopen notes.
          // Mirrors the `applyDelay` pattern used by 'Save delay' below.
          this.plugin.widgetRegistry?.applyIndentReconfigure(val);
        }),
      );

    new Setting(codeEditorGroup)
      .setName('Show relative line numbers in code editor')
      .setDesc('When enabled, the code editor gutter shows distance from cursor line. Toggle takes effect on next note open.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.lcSettings.getShowRelativeLineNumbers())
        .onChange(async (v) => {
          await this.plugin.lcSettings.setShowRelativeLineNumbers(v);
        }),
      );

    // Phase 22 (D-settings-01) — `useInlineWidget` / `useNestedEditor`
    // toggles retired with the v1.2 path. The v1.3 inline widget is the only
    // mount path and migration runs unconditionally on file open.

    // =============================
    //   Migration section
    // =============================
    new Setting(containerEl).setName('Migration').setHeading();

    const expGroup = containerEl.createDiv('lc-settings-group');

    // Phase 21 MIGRATE-06 — auto-migrate v1.2 notes when opened. Default ON
    // (D-auto-01). When OFF, the widget mount path renders a legacy banner
    // with a [Migrate now] CTA (D-auto-02). Live-applies: no reload required
    // because the next file-open consults the setting fresh from
    // SettingsStore. The onChange handler ONLY persists; never triggers
    // workspace.detachLeavesOfType or any reload path.
    new Setting(expGroup)

      .setName('Auto-migrate v1.2 notes when opened')
      .setDesc('When opening a LeetCode note from v1.2 or earlier, silently rewrite the fence to the v1.3 format. When off, a banner offers a manual [Migrate now] button.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.lcSettings.getAutoMigrateOnOpen())
        .onChange(async (v) => {
          await this.plugin.lcSettings.setAutoMigrateOnOpen(v);
          // No reload needed — live-applies on next file open.
        }),
      );

    new Setting(expGroup)
      .setName('Save delay')
      .setDesc('Time after typing stops before saving to disk. Lower = snappier; higher = fewer file-watcher events.')
      .addDropdown((d) => d
        .addOption('300', '300ms')
        .addOption('400', '400ms (default)')
        .addOption('500', '500ms')
        .addOption('1000', '1s')
        .addOption('2000', '2s')
        .setValue(String(this.plugin.lcSettings.getWidgetSyncDebounceMs()))
        .onChange(async (v) => {
          const val: 300 | 400 | 500 | 1000 | 2000 =
            v === '300' ? 300 :
            v === '500' ? 500 :
            v === '1000' ? 1000 :
            v === '2000' ? 2000 :
            400;
          await this.plugin.lcSettings.setWidgetSyncDebounceMs(val);
          // Phase 19 Plan 02 — live-apply across all live widgets without
          // note reload (D-08). No-op when no widgets registered.
          this.plugin.widgetRegistry?.applyDelay(val);
        }),
      );


    // =============================
    //   AI section (Phase 07 Plan 03 — AIPROV-01 / AIPROV-02)
    // =============================
    // Active-provider dropdown swaps the visible sub-form. When activeAIProvider
    // is null only the dropdown row renders (07-UI-SPEC §"Layout Contract").
    // All copy LOCKED VERBATIM from 07-UI-SPEC §"Copywriting Contract" — every
    // provider name, description, placeholder string, and Notice text must
    // match the spec byte-for-byte. The Test connection button delegates to
    // the shared plugin-level probe path (shared with the palette
    // command); Plan 07-05 will wrap probe() with the disclosure gate.
    //
    // Color/CTA invariant (07-UI-SPEC §"Color"): exactly ONE setCta() in this
    // file (the pre-existing Login button at line ~86). The AI section adds
    // ZERO setCta() calls — the Test connection button stays neutral. The
    // disclosure modal's Continue button (Plan 07-05) will be the only new
    // setCta() invocation in v1.1, in src/ai/disclosure.ts.
    const active = this.plugin.lcSettings.getActiveAIProvider();
    const aiEnabled = active !== null;

    new Setting(containerEl).setName('AI coach').setHeading()
      .setDesc('AI-powered debug, review, and pattern classification.')
      .addButton((b) => {
        b.setIcon('refresh-cw')
          .setTooltip('Test connection')
          .onClick(async () => {
            b.setIcon('loader');
            b.setDisabled(true);
            try {
              await this.plugin.testActiveAIConnection();
            } finally {
              b.setIcon('refresh-cw');
              b.setDisabled(false);
            }
          });
        b.buttonEl.addClass('clickable-icon');
      })
      .addToggle((toggle) => toggle
        .setValue(aiEnabled)
        .onChange(async (value) => {
          if (value) {
            await this.plugin.lcSettings.setActiveAIProvider('anthropic');
          } else {
            await this.plugin.lcSettings.setActiveAIProvider(null);
          }
          this.renderTab();
        }),
      );

    if (aiEnabled) {
      const aiConnGroup = containerEl.createDiv('lc-settings-group');

      new Setting(aiConnGroup)
        .setName('Provider')
        .setDesc("Switching providers preserves keys you've already entered.")
        .addDropdown((d) => d
          .addOption('anthropic',  'Anthropic')
          .addOption('openai',     'OpenAI')
          .addOption('openrouter', 'OpenRouter')
          .addOption('ollama',     'Ollama')
          .addOption('custom',     'Custom (OpenAI-compatible)')
          .addOption('bedrock',    'AWS Bedrock')
          .setValue(active)
          .onChange(async (v) => {
            await this.plugin.lcSettings.setActiveAIProvider(v as AIProvider);
            this.renderTab();
          }),
        );

      this.renderAIProviderForm(aiConnGroup, active);

      const aiFeatGroup = containerEl.createDiv('lc-settings-group');

      new Setting(aiFeatGroup)
        .setName('Review on accepted')
        .setDesc('Generate a review (approach, efficiency, style) each time you get accepted.')
        .addToggle((toggle) => toggle
          .setValue(this.plugin.lcSettings.getAutoAIReviewOnAC())
          .onChange(async (value) => {
            await this.plugin.lcSettings.setAutoAIReviewOnAC(value);
          }),
        );

      new Setting(aiFeatGroup)
        .setName('Pattern classification on accepted')
        .setDesc('Classify solutions into algorithmic patterns and maintain hub notes.')
        .addToggle((toggle) => toggle
          .setValue(this.plugin.lcSettings.getAutoAIKnowledgeGraph())
          .onChange(async (value) => {
            await this.plugin.lcSettings.setAutoAIKnowledgeGraph(value);
          }),
        );

      new Setting(aiFeatGroup)
        .setName('Look-ahead edges')
        .setDesc('Suggest unsolved problems related to the pattern in hub notes.')
        .addToggle((toggle) => toggle
          .setValue(this.plugin.lcSettings.getFeatureFlags().lookAheadEdges)
          .onChange(async (value) => {
            await this.plugin.lcSettings.setFeatureFlag('lookAheadEdges', value);
          }),
        );

      new Setting(aiFeatGroup)
        .setName('Contest analysis')
        .setDesc('Generate a performance summary when a virtual contest ends.')
        .addToggle((toggle) => toggle
          .setValue(this.plugin.lcSettings.getAutoAIContestAnalysis())
          .onChange(async (value) => {
            await this.plugin.lcSettings.setAutoAIContestAnalysis(value);
          }),
        );
    }

    // =============================
    //   Knowledge Graph section (Phase 5 POLISH-01 D-14)
    // =============================
    // D-17: no Advanced / collapsible section — always visible.
    // Accent-modifier grep-gate preserved: no call-to-action modifier in
    // this block (the single accent invocation is the Authentication login
    // button above — see the top-of-file grep gate).
    new Setting(containerEl).setName('Knowledge graph').setHeading();

    const kgGroup = containerEl.createDiv('lc-settings-group');
    // D-15: technique folder visible override with derived default. Placeholder
    // is computed LIVE from the current `problemsFolder` setting so users see
    // e.g. `LeetCode/Techniques` when no override is set, their typed value
    // otherwise. Empty value preserves Phase 4 derived-default behavior.
    new Setting(kgGroup)
      .setName('Technique folder override')
      .setDesc('Vault folder for technique stub notes. Leave empty to use {Problems folder}/Techniques.')
      .addText((t) => t
        .setPlaceholder(`${this.plugin.lcSettings.getProblemsFolder()}/Techniques`)
        .setValue(this.plugin.lcSettings.getTechniquesFolderOverride())
        .onChange(async (v) => {
          // Phase 4 convention — UI layer owns trailing-slash sanitization.
          await this.plugin.lcSettings.setTechniquesFolderOverride(
            v.trim().replace(/[\\/]+$/, ''),
          );
        }),
      );

    // D-16 / D-32: auto-backlink toggle (behavior-first copy LOCKED).
    // Bound to the Phase 4 D-21 persistence field.
    new Setting(kgGroup)
      .setName('Auto-create technique backlinks on accepted')

      .setDesc('When enabled, an Accepted submission writes a ## Techniques section and creates stub notes for each LC topic tag. When disabled, only frontmatter tags (lc/{slug}) are written; no ## Techniques heading, no stubs.')
      .addToggle((t) => t
        .setValue(this.plugin.lcSettings.getAutoBacklinksEnabled())
        .onChange(async (v) => {
          await this.plugin.lcSettings.setAutoBacklinksEnabled(v);
        }),
      );
  }

  /**
   * Phase 07 Plan 03 — render the per-provider sub-form for the active
   * AIProvider. Provider-conditional rendering matrix (07-UI-SPEC §Layout):
   *
   *   anthropic | openai | openrouter   API key + Base URL (read-only desc)
   *                                       + Model + Test connection
   *   ollama                            Base URL (editable) + Model
   *                                       + Test connection (NO API key row)
   *   custom                            API key + Base URL (editable, empty
   *                                       w/ placeholder) + Model
   *                                       + Test connection
   *
   * Test connection delegates to the plugin-level probe entry point; the
   * button label flips to 'Testing...' and is disabled while a probe is in
   * flight per 07-UI-SPEC §"Test connection — debouncing".
   */
  private renderAIProviderForm(containerEl: HTMLElement, active: AIProvider): void {
    const cfg = this.plugin.lcSettings.getProviderConfig(active);
    const providerName = prettyName(active);

    // ─── API key row (omitted for Ollama and Bedrock) ────────────────────
    // Phase 08.1 Plan 02 — Bedrock skips the standard API key row because
    // its 4-mode auth dropdown (default-chain / access-keys / sso-profile /
    // api-key) renders mode-specific secret rows below. Ollama remains
    // skip-listed (Phase 07 — local Ollama has no API key).
    if (active !== 'ollama' && active !== 'bedrock') {
      new Setting(containerEl)
        .setName('API key')
        .setDesc(`Stored in plain text in data.json on this machine. Never transmitted anywhere except ${providerName}.`)
        .addText((t) => {
          t.inputEl.type = 'password';
          t.inputEl.addClass('lc-ai-input');
          t.setPlaceholder('sk-…');
          t.setValue(cfg.apiKey);
          t.onChange(async (v) => {
            // Re-read the latest cfg so concurrent edits to other fields in
            // the same render frame don't get clobbered (defensive — the
            // re-render on dropdown change drops the closure anyway).
            const current = this.plugin.lcSettings.getProviderConfig(active);
            await this.plugin.lcSettings.setProviderConfig(active, { ...current, apiKey: v });
          });
        });
    }

    // ─── Base URL row ────────────────────────────────────────────────────
    switch (active) {
      case 'anthropic':
      case 'openai':
      case 'openrouter': {
        // Read-only: render the canonical URL inline in the desc text. No
        // input field — UI-SPEC §Layout Contract specifies the URL displays
        // as descriptive text.
        new Setting(containerEl)
          .setName('Base URL')
          .setDesc(`Provider endpoint. Read-only; the plugin uses the canonical URL: ${cfg.baseUrl}`);
        break;
      }
      case 'ollama': {
        new Setting(containerEl)
          .setName('Base URL')
          .setDesc('Ollama host and port. Default is localhost:11434 — change if you run Ollama on another host.')
          .addText((t) => {
            t.inputEl.addClass('lc-ai-input');
            t.setValue(cfg.baseUrl);
            t.onChange(async (v) => {
              const current = this.plugin.lcSettings.getProviderConfig(active);
              await this.plugin.lcSettings.setProviderConfig(active, { ...current, baseUrl: v });
            });
          });
        break;
      }
      case 'custom': {
        new Setting(containerEl)
          .setName('Base URL')
          .setDesc('OpenAI-compatible endpoint URL. Must include /v1 suffix if the server expects it.')
          .addText((t) => {
            t.inputEl.addClass('lc-ai-input');
            t.setPlaceholder('https://your-host.example.com/v1');
            t.setValue(cfg.baseUrl);
            t.onChange(async (v) => {
              const current = this.plugin.lcSettings.getProviderConfig(active);
              await this.plugin.lcSettings.setProviderConfig(active, { ...current, baseUrl: v });
            });
          });
        break;
      }
      case 'bedrock': {
        // Phase 08.1 Plan 02 — Bedrock-specific sub-form per CONTEXT
        // decision B + 08.1-PATTERNS.md "Plan 08.1-02 #src/settings/SettingsTab.ts".
        // Renders Region + Model ID + Auth method dropdown + conditional
        // secret rows in place of Base URL/Model rows. The 4-mode dropdown
        // calls this.renderTab() onChange so the conditional rows re-render
        // atomically — Pitfall 10 invariant: switching authMethod ONLY
        // changes which rows render, never which fields are stored.
        const bcfg = cfg as BedrockProviderConfig;

        // Region row (text input, default 'us-east-1').
        new Setting(containerEl)
          .setName('Region')
          .setDesc('AWS region for Bedrock runtime endpoint. Default: us-east-1.')
          .addText((t) => {
            t.inputEl.addClass('lc-ai-input');
            t.setPlaceholder('us-east-1');
            t.setValue(bcfg.region);
            t.onChange(async (v) => {
              const current = this.plugin.lcSettings.getProviderConfig(active) as BedrockProviderConfig;
              await this.plugin.lcSettings.setProviderConfig(active, { ...current, region: v });
            });
          });

        // Model ID row (replaces the generic Model row for Bedrock).
        new Setting(containerEl)
          .setName('Model ID')
          .setDesc('Bedrock model identifier (e.g. us.anthropic.claude-sonnet-4-6).')
          .addText((t) => {
            t.inputEl.addClass('lc-ai-input');
            t.setValue(bcfg.modelId);
            t.onChange(async (v) => {
              const current = this.plugin.lcSettings.getProviderConfig(active) as BedrockProviderConfig;
              await this.plugin.lcSettings.setProviderConfig(active, { ...current, modelId: v });
            });
          });

        // Auth method dropdown — onChange triggers a re-render so the
        // conditional secret rows below swap atomically.
        new Setting(containerEl)
          .setName('Credential source')
          .setDesc('How the plugin obtains AWS credentials for Bedrock calls.')
          .addDropdown((d) => d
            .addOption('default-chain', 'Default credential chain (recommended)')
            .addOption('access-keys',   'Explicit access keys')
            .addOption('sso-profile',   'Profile name')
            .addOption('api-key',       'Bedrock API key')
            .setValue(bcfg.authMethod)
            .onChange(async (v) => {
              const current = this.plugin.lcSettings.getProviderConfig(active) as BedrockProviderConfig;
              await this.plugin.lcSettings.setProviderConfig(active, {
                ...current,
                authMethod: v as BedrockProviderConfig['authMethod'],
              });
              // Re-render so the conditional secret rows for the newly-active
              // mode appear atomically. Pitfall 10 invariant: this only
              // changes which rows RENDER — `current` (and the persisted
              // config) keeps every secret field byte-for-byte intact.
              this.renderTab();
            }),
          );

        // Conditional secret rows — only the active mode's rows render, but
        // ALL secret fields stay PERSISTED in data.json (Pitfall 10).
        if (bcfg.authMethod === 'default-chain') {
          // Helper-text-only row — no input.
          new Setting(containerEl)
            .setName('Credentials source')
            .setDesc('Plugin reads AWS credentials from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY env vars first, then falls back to AWS_PROFILE (or AWS_DEFAULT_PROFILE, or [default]) in ~/.aws/credentials and ~/.aws/config. Supports credential_process helpers and honors AWS_SHARED_CREDENTIALS_FILE / AWS_CONFIG_FILE overrides. Run aws sso login (or your usual helper) before launching Obsidian if your profile uses SSO.');
        } else if (bcfg.authMethod === 'access-keys') {
          new Setting(containerEl)
            .setName('Access key ID')
            .setDesc('AWS access key ID. Stored in plain text in data.json on this machine.')
            .addText((t) => {
              t.inputEl.type = 'password';
              t.inputEl.addClass('lc-ai-input');
              t.setValue(bcfg.accessKeyId ?? '');
              t.onChange(async (v) => {
                const current = this.plugin.lcSettings.getProviderConfig(active) as BedrockProviderConfig;
                await this.plugin.lcSettings.setProviderConfig(active, { ...current, accessKeyId: v });
              });
            });
          new Setting(containerEl)
            .setName('Secret access key')
            .setDesc('AWS secret access key. Stored in plain text in data.json on this machine.')
            .addText((t) => {
              t.inputEl.type = 'password';
              t.inputEl.addClass('lc-ai-input');
              t.setValue(bcfg.secretAccessKey ?? '');
              t.onChange(async (v) => {
                const current = this.plugin.lcSettings.getProviderConfig(active) as BedrockProviderConfig;
                await this.plugin.lcSettings.setProviderConfig(active, { ...current, secretAccessKey: v });
              });
            });
          new Setting(containerEl)
            .setName('Session token')
            .setDesc('Required only for temporary STS credentials.')
            .addText((t) => {
              t.inputEl.type = 'password';
              t.inputEl.addClass('lc-ai-input');
              t.setValue(bcfg.sessionToken ?? '');
              t.onChange(async (v) => {
                const current = this.plugin.lcSettings.getProviderConfig(active) as BedrockProviderConfig;
                await this.plugin.lcSettings.setProviderConfig(active, { ...current, sessionToken: v });
              });
            });
        } else if (bcfg.authMethod === 'sso-profile') {
          new Setting(containerEl)
            .setName('Profile name')
            .setDesc('Any profile name from ~/.aws/credentials or ~/.aws/config. Use this if you want a specific profile without exporting AWS_PROFILE. Supports credential_process helpers (e.g. aws-vault, awsume).')
            .addText((t) => {
              t.inputEl.addClass('lc-ai-input');
              t.setValue(bcfg.ssoProfile ?? '');
              t.onChange(async (v) => {
                const current = this.plugin.lcSettings.getProviderConfig(active) as BedrockProviderConfig;
                await this.plugin.lcSettings.setProviderConfig(active, { ...current, ssoProfile: v });
              });
            });
        } else if (bcfg.authMethod === 'api-key') {
          new Setting(containerEl)
            .setName('Bedrock API key')
            .setDesc('Long-term Bedrock API key from the AWS console (IAM > Users > Service-specific credentials). Stored in plain text in data.json on this machine.')
            .addText((t) => {
              t.inputEl.type = 'password';
              t.inputEl.addClass('lc-ai-input');
              t.setValue(bcfg.bedrockApiKey ?? '');
              t.onChange(async (v) => {
                const current = this.plugin.lcSettings.getProviderConfig(active) as BedrockProviderConfig;
                await this.plugin.lcSettings.setProviderConfig(active, { ...current, bedrockApiKey: v });
              });
            });
        }
        break;
      }
    }

    // ─── Model row (all providers EXCEPT Bedrock — Bedrock uses Model ID) ─
    // Phase 08.1 Plan 02 — Bedrock's case branch above already rendered a
    // dedicated "Model ID" row, so we skip the generic Model row when
    // active === 'bedrock' to avoid duplicate input rows. The Model ID row
    // writes to cfg.modelId; the generic row writes to cfg.model (which is
    // unused for Bedrock).
    if (active !== 'bedrock') {
      new Setting(containerEl)
        .setName('Model')
        .setDesc('Model identifier the provider expects. Defaults may rot — when "Test connection" reports "model not found", update this field.')
        .addText((t) => {
          t.inputEl.addClass('lc-ai-input');
          t.setPlaceholder(modelPlaceholder(active));
          t.setValue(cfg.model);
          t.onChange(async (v) => {
            const current = this.plugin.lcSettings.getProviderConfig(active);
            await this.plugin.lcSettings.setProviderConfig(active, { ...current, model: v });
          });
        });
    }

  }
}
