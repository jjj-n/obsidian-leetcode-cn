import tseslint from 'typescript-eslint';
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
  {
    // Type-checked rules need parserOptions only on TS/TSX files. Scoping
    // here (instead of the root) prevents the obsidianmd recommended config
    // from trying to apply typed rules (e.g., `no-plugin-as-component`) to
    // `package.json` — which the plugin handles in its own JSON block via
    // `language: 'json/json'` and `tseslint.configs.disableTypeChecked`.
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: { allowDefaultProject: ['vitest.config.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  ...obsidianmd.configs.recommended,
  // Plugin-wide rule tuning. `LeetCode` is a brand name (capital C) so the
  // sentence-case rule must treat it like Obsidian's own default brands; the
  // recommended config doesn't ship with LC pre-loaded.
  //
  // Phase 07 Plan 03 — AI provider brand names + protocol/host tokens are
  // added so 07-UI-SPEC §"Copywriting Contract" verbatim-locked strings (e.g.
  // 'Anthropic', 'OpenAI', 'OpenRouter', 'Ollama', 'Custom (OpenAI-compatible)',
  // base URLs containing 'HTTPS://', 'localhost:11434') don't trip the
  // sentence-case rule. Each entry below has a corresponding lock in
  // .planning/phases/07-ai-provider-foundation/07-UI-SPEC.md.
  {
    plugins: { obsidianmd },
    rules: {
      'obsidianmd/ui/sentence-case': [
        'error',
        {
          enforceCamelCaseLower: true,
          brands: [
            'LeetCode', 'LEETCODE_SESSION', 'csrftoken',
            // Phase 11 Plan 02 AIKG-01 — 'OTHER' is the literal frontmatter
            // value persisted to lc-pattern when AI classification fails to
            // match a known taxonomy entry. The OtherPatternModal copy quotes
            // this identifier verbatim so users see the exact value being
            // stored ("accept \"OTHER\" to leave it unclassified").
            'OTHER',
            // Phase 07 Plan 03 AI provider brands (07-UI-SPEC).
            'Anthropic', 'OpenAI', 'OpenRouter', 'Ollama',
            'OpenAI-compatible',
            // Phase 08.1 Plan 02 — AWS Bedrock + AWS infrastructure brand
            // tokens used in Settings copy (Region, Model ID, Auth method
            // dropdown labels, helper text). 'AWS Bedrock' is the verbatim
            // dropdown label per CONTEXT decision B; 'SSO' / 'IAM' appear
            // in helper text for sso-profile and api-key auth modes; 'STS'
            // (Security Token Service) appears in the access-keys helper
            // copy describing temporary credentials.
            'AWS', 'Bedrock', 'SSO', 'IAM', 'STS',
            // Locked URL/host substrings used in verbatim copy + placeholders.
            // 'https' is intentionally lowercase: the placeholder
            // 'https://your-host.example.com/v1' (07-UI-SPEC §"Copywriting
            // Contract") is verbatim-locked, so the brand entry preserves
            // the lowercase canonical instead of forcing 'HTTPS://'.
            'localhost', 'https', 'sk-…',
            // Plan-numbered grep-replace markers (locked by 07-UI-SPEC for
            // Plan 07-04 to substitute in cleanly).
            'Plan 07-04',
            // CLI command examples used in Notice copy (locked verbatim by
            // 07-UI-SPEC §"Notice copy").
            'ollama pull',
            // Test connection ships as a sentence-case-tolerant button label;
            // Obsidian's own rule treats it as already valid, but the
            // verbatim quote inside Model row's desc text contains "Test
            // connection" preceded by quotes which trips the rule.
            'Test connection',
            // Phase 07 AI-coach section — 'AI-powered' is a hyphenated
            // brand-style compound; the rule's first-token capitalization
            // logic mishandles hyphenated tokens at sentence start (would
            // emit 'Ai-powered'). Registering the compound as a brand
            // preserves the canonical casing.
            'AI-powered',
            // Phase 08.1 Plan 02 — verbatim Bedrock model ID example and
            // AWS region literal (lowercase per AWS convention) used in
            // 'Bedrock model identifier (e.g. us.anthropic.claude-sonnet-4-6).'
            // and the Region row's placeholder/desc.
            'us.anthropic.claude-sonnet-4-6', 'us-east-1',
            // Phase 16 INDENT-04 D-06 — preserves the lowercase 'spaces'
            // unit in the dropdown labels ('2 spaces', '4 spaces',
            // '8 spaces') so the rule does not capitalize them after the
            // numeric prefix.
            'spaces',
          ],
          ignoreRegex: [
            // cn fork — the settings UI is Chinese. An English sentence-case
            // rule cannot evaluate CJK text (it mangles embedded brand words
            // like 'LeetCode'/'Cookie' mid-sentence), so any string containing
            // a CJK character is skipped wholesale. Pure-English strings stay
            // checked.
            '[\\u4e00-\\u9fff]',
            // Phase 19 save-delay dropdown labels are unit-suffixed numerics
            // ('300ms', '400ms (default)', '500ms', '1s', '2s') — not
            // English sentences. The rule's first-token capitalization
            // logic mangles 'ms'/'s' (suggesting '300Ms', '1S'), so these
            // option labels are skipped wholesale via regex.
            '^\\d+\\s*(ms|s)(\\s*\\(default\\))?$',
            // Phase 08.1 Plan 02 — AWS default-chain and sso-profile helper
            // copy contains the dotfile path literals '~/.aws/credentials'
            // and '~/.aws/config'. Registering the 'AWS' brand for the
            // uppercase env-var prefixes ('AWS_PROFILE', etc.) would case-
            // fold the lowercase 'aws' segment of those paths to 'AWS',
            // breaking the literal. Skipping any string containing
            // '~/.aws/' avoids that conflict.
            '~/\\.aws/',
            // Phase 16 INDENT-04 D-06 — the indent-size dropdown desc
            // lists per-language defaults ('4 for Java/Python/C++, 2 for
            // JS/TS, tab for Go') and references the '"Auto"' option key.
            // Adding the language names as global brands forces uppercase
            // canonicalization in unrelated Notice copy (e.g. the widget
            // controller's lowercase fallback 'falling back to python.').
            // Skipping this one verbatim D-06 sentence keeps the listing
            // intact without leaking language-name brands project-wide.
            '^Number of spaces per indent level in the code editor\\.',
          ],
        },
      ],
    },
  },
  // Test files run under vitest with happy-dom. Production rules (sentence
  // case, popout-window timers, vault casts) target plugin runtime behaviour
  // and don't apply to pure unit tests. The type-checked `no-unsafe-*` rules
  // and `no-deprecated` also don't pull their weight against vi.fn() mocks
  // that return `any` by design. Note: obsidianmd/rule-custom-message is
  // intentionally NOT disabled here — the plugin store rejects any disable
  // of that rule across the project.
  {
    files: ['tests/**/*.ts'],
    plugins: { obsidianmd },
    rules: {
      'obsidianmd/prefer-active-doc': 'off',
      'obsidianmd/prefer-active-window-timers': 'off',
      'obsidianmd/prefer-create-el': 'off',
      'obsidianmd/no-tfile-tfolder-cast': 'off',
      'obsidianmd/no-static-styles-assignment': 'off',
      'obsidianmd/ui/sentence-case': 'off',
      'obsidianmd/commands/no-plugin-id-in-command-id': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-deprecated': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/unbound-method': 'off',
      'import/no-extraneous-dependencies': 'off',
    },
  },
  globalIgnores([
    "node_modules", "dist", "esbuild.config.mjs", "eslint.config.js",
    "eslint.config.mts",
    "version-bump.mjs", "versions.json", "main.js",
    "scripts/**",
    // Phase 06 FOUND-01 — eslint-plugin-obsidianmd@^0.3.0 hybrid config
    // applies typed rules (e.g., `no-plugin-as-component`) to ALL files
    // because the outer hybrid config block has no `files:` filter, while
    // its embedded JSON-parser block targets only `package.json` via
    // `language: 'json/json'`. Routing `package.json` through the TS
    // parser then dies inside the typed rule's getParserServices call.
    // We rely on the project's own `validate-manifest.json` test
    // (`tests/manifest-version.test.ts`) and `prerelease-check.sh`
    // gate 6 for the manifest contract, so ignoring JSON for lint is safe.
    "package.json", "manifest.json", "package-lock.json", "tsconfig.json",
    ".claude/**",
  ]),
);
