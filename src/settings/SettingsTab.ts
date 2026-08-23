// src/settings/SettingsTab.ts
// Chinese-language settings UI for the cn fork (workflow A).
//
// Layout: 登录 → 笔记 → 图片 → 自定义占位符. The removed-feature remnants
// (AI coach / Knowledge graph / Click behavior sections from the upstream
// fork) no longer render — their SettingsStore fields persist untouched for
// data.json compatibility.
//
// Accent color (`var(--interactive-accent)` via the call-to-action modifier)
// is RESERVED for the primary 登录 button only (one setCta() in this file).
import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type LeetCodePlugin from '../main';
import type { AuthCookies } from '../auth/types';
import { BUILTIN_NAMES } from '../notes/TemplateEngine';

// Mirrors LC's submission-language dropdown. Keys = LC langSlug (the value LC
// accepts in /interpret_solution/ + /submit/ bodies); values = UI display
// labels. Insertion order matches LC's own dropdown order and drives the
// rendered order (`Object.entries` preserves insertion order for string keys).
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
  // New-placeholder row draft state. Instance fields (not locals) so they
  // survive renderTab() re-renders while the user is typing.
  private placeholderAddName = '';
  private placeholderAddValue = '';

  constructor(app: App, private readonly plugin: LeetCodePlugin) {
    super(app, plugin);
  }

  display(): void {
    this.renderTab();
  }

  // Internal re-render hook used by click handlers that need to refresh the
  // tab after mutating auth/settings state.
  private renderTab(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('leetcode-settings');

    // =============================
    //   登录
    // =============================
    new Setting(containerEl).setName('登录').setHeading();

    const loggedIn = this.plugin.auth.isLoggedIn();
    const username = this.plugin.lcSettings.getUsername();
    const statusText = loggedIn
      ? `已登录：${username ?? '…'}`
      : '未登录（抓取公开题目无需登录，付费题与题解需要登录）';

    // Status row + auth button merged into a single Setting (name/desc left,
    // button right). Exactly one setCta() in this file — the logged-out 登录.
    new Setting(containerEl)
      .setName('状态')
      .setDesc(statusText)
      .addButton((b) => {
        if (loggedIn) {
          b.setButtonText('登出')
            .setTooltip('退出 LeetCode 登录')
            .onClick(async () => {
              await this.plugin.auth.logout();
              this.renderTab();
            });
        } else {
          b.setButtonText('通过内置浏览器登录')
            .setCta()
            .onClick(async () => {
              await this.plugin.auth.login();
              this.renderTab();
            });
        }
      });

    // =============================
    //   站点
    // =============================
    new Setting(containerEl)
      .setName('站点')
      .setDesc('连接的 LeetCode 站点：leetcode.cn（中国站）或 leetcode.com（国际站）。')
      .addDropdown((d) => d
        .addOption('cn', 'leetcode.cn（中国站）')
        .addOption('com', 'leetcode.com（国际站）')
        .setValue(this.plugin.lcSettings.getRegion())
        .onChange(async (v) => {
          await this.plugin.lcSettings.setRegion(v as 'com' | 'cn');
          new Notice(`站点已切换为 ${v === 'cn' ? 'leetcode.cn' : 'leetcode.com'}。已有笔记保持原链接，新笔记使用新站点。`, 5000);
        }),
      );

    // =============================
    //   手动 Cookie（备用）
    // =============================
    let sessionVal = '';
    let csrfVal = '';

    new Setting(containerEl)
      .setName('手动 Cookie（备用）')
      .setDesc('内置浏览器登录不可用时的兜底：从浏览器复制 LeetCode 的两个 Cookie 粘贴到这里。')
      .setHeading()
      .addButton((b) => {
        b.setIcon('save')
          .setTooltip('保存 Cookie')
          .onClick(async () => {
            const session = sessionVal.trim();
            const csrf = csrfVal.trim();
            if (!session || !csrf) {
              new Notice('两个 Cookie 字段都必须填写。', 3000);
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
    //   笔记
    // =============================
    new Setting(containerEl).setName('笔记').setHeading();

    const notesGroup = containerEl.createDiv('lc-settings-group');
    new Setting(notesGroup)
      .setName('题目笔记文件夹')
      .setDesc('题目笔记存放的 vault 文件夹（不存在会自动创建）。')
      .addText((t) => t
        .setPlaceholder('LeetCode/')
        .setValue(this.plugin.lcSettings.getProblemsFolder())
        .onChange(async (v) => {
          // Strip trailing slash on persist (stored without trailing slash).
          await this.plugin.lcSettings.setProblemsFolder(v.replace(/\/+$/, ''));
        }),
      );

    new Setting(notesGroup)
      .setName('默认代码语言')
      .setDesc('新题目笔记中初始代码的语言。')
      .addDropdown((d) => d
        .addOptions(LANGUAGE_OPTIONS)
        .setValue(this.plugin.lcSettings.getDefaultLanguage())
        .onChange(async (v) => {
          await this.plugin.lcSettings.setDefaultLanguage(v);
        }),
      );

    new Setting(notesGroup)
      .setName('笔记尾部附加内容')
      .setDesc('追加到每篇新笔记末尾的内容（如 dataview 刷题回顾表）。支持全部占位符，{{language}} 会替换成该篇的语言 tag。留空则不追加。')
      .addTextArea((t) => {
        t.inputEl.addClass('lc-footer-input');
        t.setPlaceholder('例如：\n## 最近刷题回顾\n```dataview\n…\n```')
          .setValue(this.plugin.lcSettings.getNoteFooter())
          .onChange(async (v) => {
            await this.plugin.lcSettings.setNoteFooter(v);
          });
      });

    // =============================
    //   图片
    // =============================
    new Setting(containerEl).setName('图片').setHeading();

    const imageGroup = containerEl.createDiv('lc-settings-group');
    new Setting(imageGroup)
      .setName('下载图片到 vault')
      .setDesc('开启后，题面中的图片会下载到 vault，笔记离线也能看。')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.lcSettings.getDownloadImages())
        .onChange(async (v) => {
          await this.plugin.lcSettings.setDownloadImages(v);
          this.renderTab();
        }),
      );

    if (this.plugin.lcSettings.getDownloadImages()) {
      new Setting(imageGroup)
        .setName('图片文件夹')
        .setDesc('下载图片的存放文件夹。')
        .addText((t) => t
          .setPlaceholder('附件/LeetCode')
          .setValue(this.plugin.lcSettings.getImageFolder())
          .onChange(async (v) => {
            await this.plugin.lcSettings.setImageFolder(v);
          }),
        );
    }

    // =============================
    //   自定义占位符
    // =============================
    new Setting(containerEl).setName('自定义占位符').setHeading()
      .setDesc('定义你自己的 {{占位符}}，值里可以引用内置占位符（如 {{my_id}} = "lc-{{id}}"）。');

    const placeholderGroup = containerEl.createDiv('lc-settings-group');

    const customPlaceholders = this.plugin.lcSettings.getCustomPlaceholders();
    const entries = Object.entries(customPlaceholders);

    entries.forEach(([name, value]) => {
      new Setting(placeholderGroup)
        .setName(`{{${name}}}`)
        .addText((t) => t
          .setPlaceholder('值（如 lc-{{id}}）')
          .setValue(value)
          .onChange(async (v) => {
            await this.plugin.lcSettings.setCustomPlaceholder(name, v);
          }),
        )
        .addExtraButton((b) => b
          .setIcon('trash')
          .setTooltip('删除该占位符')
          .onClick(async () => {
            await this.plugin.lcSettings.removeCustomPlaceholder(name);
            this.renderTab();
          }),
        );
    });

    // New-placeholder row: name + value inputs + add button.
    // Draft state lives in the instance fields declared above so it survives
    // renderTab() re-renders during typing.
    new Setting(placeholderGroup)
      .setName('新增占位符')
      .addText((t) => t
        .setPlaceholder('名称（snake_case）')
        .setValue(this.placeholderAddName)
        .onChange((v) => { this.placeholderAddName = v; }),
      )
      .addText((t) => t
        .setPlaceholder('值模板')
        .setValue(this.placeholderAddValue)
        .onChange((v) => { this.placeholderAddValue = v; }),
      )
      .addExtraButton((b) => b
        .setIcon('plus')
        .setTooltip('添加占位符')
        .onClick(async () => {
          const trimmed = this.placeholderAddName.trim();
          if (!trimmed) return;
          if (!/^[a-z][a-z0-9_]*$/.test(trimmed)) {
            new Notice('占位符名称必须是 snake_case（a-z、0-9、_），且以字母开头。', 5000);
            return;
          }
          if (customPlaceholders[trimmed] !== undefined) {
            new Notice(`占位符 {{${trimmed}}} 已存在。`, 4000);
            return;
          }
          if (BUILTIN_NAMES.has(trimmed)) {
            new Notice(`{{${trimmed}}} 是内置占位符，不能覆盖。`, 4000);
            return;
          }
          await this.plugin.lcSettings.setCustomPlaceholder(trimmed, this.placeholderAddValue.trim());
          this.placeholderAddName = '';
          this.placeholderAddValue = '';
          this.renderTab();
        }),
      );
  }
}
