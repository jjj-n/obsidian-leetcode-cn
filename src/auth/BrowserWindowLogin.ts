// src/auth/BrowserWindowLogin.ts
// ONLY file allowed to import electron (D-02, CF-06).
// All other files that need login MUST go through AuthService.
import type { AuthCookies } from './types';

// `loadElectron` returns Obsidian's renderer-process Electron surface.
// We bundle as CJS with `electron` marked external, so this resolves to a
// runtime `require('electron')` against the host without bringing the source
// `require()` form back into the lint-checked code.
type CjsRequire = (id: string) => unknown;
declare const __webpack_require__: CjsRequire | undefined;
function nodeRequire(id: string): unknown {
  // Look up Node's own require via globalThis so we never literally type
  // `require(...)` here (the obsidianmd-recommended config bans
  // @typescript-eslint/no-require-imports). The Obsidian renderer + every
  // CJS bundle exposes `module.require`; if that's missing we fall back to
  // the global require shim webpack-style bundlers install.
  const g = activeWindow as unknown as { require?: CjsRequire; module?: { require?: CjsRequire } };
  const fn = g.require ?? g.module?.require ?? (typeof __webpack_require__ === 'function' ? __webpack_require__ : undefined);
  if (!fn) throw new Error('Node require() unavailable from renderer.');
  return fn(id);
}

function loadElectron(): ElectronModule {
  return nodeRequire('electron') as ElectronModule;
}

function loadElectronRemote(): ElectronRemote | null {
  try {
    return nodeRequire('@electron/remote') as ElectronRemote;
  } catch {
    return null;
  }
}

// Minimal cookie shape from Electron's session.cookies.get() — we only need name + value.
export interface ElectronCookieShape {
  name: string;
  value: string;
  domain?: string;
  path?: string;
}

/**
 * Pure helper — extracts LEETCODE_SESSION + csrftoken from an Electron cookie list.
 * Returns null if either cookie is missing. Exported for unit testing (AUTH-02).
 */
export function extractAuthCookies(cookies: ElectronCookieShape[]): AuthCookies | null {
  const lcSession = cookies.find((c) => c.name === 'LEETCODE_SESSION');
  const csrf = cookies.find((c) => c.name === 'csrftoken');
  if (!lcSession || !csrf) return null;
  return {
    LEETCODE_SESSION: lcSession.value,
    csrftoken: csrf.value,
  };
}

// -----------------------------------------------------------------------------
// Minimal structural types for the subset of Electron API we touch.
// We don't depend on `@types/electron` — Electron is external to the esbuild
// bundle and provided by the Obsidian host. Declaring the shapes we use keeps
// the `require('electron')` call strongly typed and avoids `unsafe` lint
// findings without pulling in the full Electron type package.
// -----------------------------------------------------------------------------
export interface ElectronCookiesApi {
  // Filter shape widened to accept either { url } (production callsite — issue #16)
  // or { domain } (kept declarable for future refactors). Both optional.
  get(filter: { url?: string; domain?: string }): Promise<ElectronCookieShape[]>;
}

/**
 * Captures LeetCode auth cookies from an Electron session cookies API and
 * extracts the LEETCODE_SESSION + csrftoken pair.
 *
 * Uses `{ url: 'https://leetcode.com/' }` as the filter (NOT `{ domain: ... }`)
 * because Electron interprets the URL filter as "all cookies that would be sent
 * on a request to that URL" — which is exactly what the API client needs by
 * construction, and crucially INCLUDES host-only cookies (no Domain attribute,
 * stored under `leetcode.com` without a leading dot). LC sometimes sets
 * csrftoken as a host-only cookie; the previous `{ domain: '.leetcode.com' }`
 * filter omitted those, which silently broke embedded login (issue #16).
 *
 * Returns null when either required cookie is missing or when the underlying
 * cookies.get rejects. AUTH-06 invariant: catch is bare — never logs the
 * cookie list, error message, or filter contents.
 *
 * Exported for unit testing — the production path in `openLogin` delegates to
 * this helper so the test that mocks `cookies.get` covers the production filter
 * shape.
 */
export async function tryCaptureCookies(
  cookies: ElectronCookiesApi,
  region: 'com' | 'cn' = 'cn',
): Promise<AuthCookies | null> {
  const cookieUrl = region === 'com' ? 'https://leetcode.com/' : 'https://leetcode.cn/';
  try {
    const list = await cookies.get({ url: cookieUrl });
    return extractAuthCookies(list);
  } catch {
    // AUTH-06: never log cookie data on failure; next event will retry.
    return null;
  }
}
interface ElectronSession {
  cookies: ElectronCookiesApi;
}
interface ElectronWebContents {
  session: ElectronSession;
  on(event: string, listener: () => void): void;
}
interface ElectronBrowserWindow {
  webContents: ElectronWebContents;
  on(event: 'closed', listener: () => void): void;
  loadURL(url: string): Promise<void>;
  close(): void;
}
interface BrowserWindowOptions {
  width?: number;
  height?: number;
  show?: boolean;
  autoHideMenuBar?: boolean;
  webPreferences?: {
    partition?: string;
    nodeIntegration?: boolean;
    contextIsolation?: boolean;
  };
}
type BrowserWindowCtor = new (opts: BrowserWindowOptions) => ElectronBrowserWindow;
interface ElectronSessionModule {
  fromPartition(partition: string): { clearStorageData(opts?: { storages?: string[] }): Promise<void> };
}
interface ElectronRemote {
  BrowserWindow?: BrowserWindowCtor;
  session?: ElectronSessionModule;
}
interface ElectronModule {
  // Main-process entry (available when Obsidian runs the plugin in main context)
  BrowserWindow?: BrowserWindowCtor;
  session?: ElectronSessionModule;
  // Renderer-process entry — Obsidian's Electron exposes the main-process API
  // via `remote` for plugins running in renderer context.
  remote?: ElectronRemote;
}

/** Tagged-union result from `openLogin` — exhaustively handled in AuthService.login. */
export type OpenLoginResult =
  | { kind: 'success'; cookies: AuthCookies }
  | { kind: 'cancelled' }
  | { kind: 'timeout' };

/** Maximum time to wait for cookie capture before surfacing a timeout Notice (issue #16). */
const LOGIN_CAPTURE_TIMEOUT_MS = 30_000;

/**
 * Opens an Electron BrowserWindow at LC's login page on a named session partition.
 * Polls session cookies on did-navigate and did-navigate-in-page events until both
 * LEETCODE_SESSION and csrftoken are present, then resolves with `{ kind: 'success', cookies }`.
 *
 * Resolves `{ kind: 'cancelled' }` if the user closes the window without logging in
 * (D-04 silent-cancel) or if loadURL fails. Resolves `{ kind: 'timeout' }` if cookie
 * capture has not succeeded within LOGIN_CAPTURE_TIMEOUT_MS — surfaces the
 * "looks-like-cancel-but-isn't" failure mode (issue #16).
 *
 * CONTRACT:
 * - D-03: Cookie polling via did-navigate + did-navigate-in-page (dual listener per Pitfall 2).
 * - D-04: Window closed without cookies → resolve({kind:'cancelled'}); caller emits Notice.
 * - Pitfall 3: webPreferences.partition uses a named persisted session to isolate
 *   cookies from other plugins.
 */
export function openLogin(region: 'com' | 'cn' = 'cn'): Promise<OpenLoginResult> {
  const loginUrl = region === 'com'
    ? 'https://leetcode.com/accounts/login/'
    : 'https://leetcode.cn/accounts/login/';
  // Obsidian runs plugins in the renderer process. `require('electron')` from
  // renderer context exposes a different surface than main process — the
  // `BrowserWindow` constructor lives under `.remote` (shimmed by Obsidian's
  // host via @electron/remote) or must be loaded via @electron/remote directly.
  // Probe both paths so the plugin works across Obsidian versions.
  //
  // Phase 06 FOUND-01: `require('electron')` is the canonical pattern per
  // CLAUDE.md / PROJECT.md (avoiding the deprecated `@electron/remote`
  // dependency). `import electron from 'electron'` does not work in
  // Obsidian's bundled renderer — only the dynamic `require` resolves the
  // host-injected Electron surface. We delegate to `loadElectron()` (which
  // routes through `nodeRequire`) so this file contains no literal
  // `require(...)` form — the obsidianmd recommended config bans
  // @typescript-eslint/no-require-imports.
  const electron = loadElectron();
  let BrowserWindow: BrowserWindowCtor | undefined = electron.BrowserWindow;
  if (!BrowserWindow && electron.remote) {
    BrowserWindow = electron.remote.BrowserWindow;
  }
  if (!BrowserWindow) {
    BrowserWindow = loadElectronRemote()?.BrowserWindow;
  }
  if (!BrowserWindow) {
    return Promise.reject(
      new Error(
        'BrowserWindow unavailable — renderer-process Electron did not expose it via electron.remote or @electron/remote. Use the cookie-paste fallback in Settings.',
      ),
    );
  }
  const BrowserWindowCtor = BrowserWindow;

  return new Promise((resolve) => {
    const win = new BrowserWindowCtor({
      width: 980,
      height: 720,
      show: true,
      autoHideMenuBar: true,
      webPreferences: {
        partition: 'persist:leetcode', // D-03 — isolated cookie jar (Pitfall 3)
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    let resolved = false;
    // window.setTimeout returns `number` in browser/renderer context (Obsidian
    // convention — see src/widget/childParentSync.ts, debouncedWriter.ts).
    let timeoutHandle: number | null = null;

    /** Centralized resolution: clears the watchdog timer, marks resolved, resolves the promise. */
    const settle = (result: OpenLoginResult): void => {
      if (resolved) return;
      resolved = true;
      if (timeoutHandle) {
        window.clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      resolve(result);
    };

    const safeClose = (): void => {
      // The window may already have been destroyed by the OS, a prior close(),
      // or a loadURL failure. Swallow so we never hand a rejected promise
      // back to the auth flow (CR-05).
      try { win.close(); } catch { /* already destroyed — closed event handles state */ }
    };

    // Issue #16: 30s capture-timeout watchdog. Without this, a host-only
    // csrftoken (or any other future cookie-jar quirk) makes the window appear
    // to succeed (URL becomes the logged-in page) but extractAuthCookies stays
    // null forever — the user closes the window and gets the silent-cancel
    // Notice with no indication anything went wrong. The watchdog converts that
    // into a distinct, actionable Notice via the 'timeout' tag.
    timeoutHandle = window.setTimeout(() => {
      settle({ kind: 'timeout' });
      safeClose();
    }, LOGIN_CAPTURE_TIMEOUT_MS);

    // Register the 'closed' handler BEFORE loadURL. If loadURL synchronously
    // tears the window down before returning (rare but possible on invalid
    // URLs in some Electron builds), the silent-cancel path still fires.
    win.on('closed', () => {
      settle({ kind: 'cancelled' }); // D-04 silent-cancel
    });

    const tryCapture = async (): Promise<void> => {
      if (resolved) return;
      // Delegate to the exported helper so the unit test that mocks
      // `cookies.get` covers the production filter shape (issue #16).
      const extracted = await tryCaptureCookies(win.webContents.session.cookies, region);
      if (extracted && !resolved) {
        settle({ kind: 'success', cookies: extracted });
        safeClose();
      }
    };

    win.webContents.on('did-navigate', () => {
      void tryCapture();
    });
    win.webContents.on('did-navigate-in-page', () => {
      void tryCapture();
    }); // SPA route change (Pitfall 2)

    // If loadURL rejects (network down, DNS failure, ERR_CERT_*, etc.) and
    // the window never emits 'closed' on its own, the caller's await would
    // hang forever. Catch, resolve cancelled, and force-close so the auth
    // flow always settles (CR-05). Semantically still a cancel — user did
    // not log in.
    win.loadURL(loginUrl).catch(() => {
      settle({ kind: 'cancelled' });
      safeClose();
    });
  });
}

/**
 * Clear the `persist:leetcode` Electron session partition so the next embedded
 * login actually prompts for credentials instead of auto-signing-in from the
 * cached cookie jar. Called from AuthService.logout().
 *
 * Swallows all errors: clearing is best-effort (user already sees "Logged out"
 * Notice and data.json is clean; a stale partition just means the next login
 * auto-completes, which is recoverable).
 */
export async function clearLeetCodePartitionCookies(): Promise<void> {
  try {
    const electron = loadElectron();
    const session = electron.session ?? electron.remote?.session;
    if (!session) {
      // Try @electron/remote as a last resort (Obsidian ships with it loaded).
      const remoteSession = loadElectronRemote()?.session;
      if (remoteSession) {
        await remoteSession.fromPartition('persist:leetcode').clearStorageData({
          storages: ['cookies'],
        });
      }
      // No remote available: accept stale partition state. The data.json
      // cookies were already cleared so API calls will still fail-then-prompt.
      return;
    }
    await session.fromPartition('persist:leetcode').clearStorageData({
      storages: ['cookies'],
    });
  } catch {
    // Intentionally silent — see contract above.
  }
}
