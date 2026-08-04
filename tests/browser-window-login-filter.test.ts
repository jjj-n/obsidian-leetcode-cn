import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  tryCaptureCookies,
  type ElectronCookieShape,
  type ElectronCookiesApi,
} from '../src/auth/BrowserWindowLogin';

/**
 * Locks in the issue #16 fix: cookies.get is called with { url } NOT { domain }.
 *
 * Why a runtime test over a grep gate alone:
 * - A grep gate misses semantic regressions (subtle URL change, dropped slash,
 *   or a future "helpful" PR that re-adds a `domain` field next to `url`).
 * - The runtime test drives the actual exported helper, so it covers the
 *   production filter shape.
 *
 * AUTH-06 invariant: error paths must never log the cookie list. Test 4 spies on
 * console.* and asserts zero calls.
 */

interface CookiesGetCall {
  url?: string;
  domain?: string;
}

interface FakeCookiesHandle {
  calls: CookiesGetCall[];
  api: ElectronCookiesApi;
}

function fakeCookies(
  impl: (filter: CookiesGetCall) => Promise<ElectronCookieShape[]>,
): FakeCookiesHandle {
  const calls: CookiesGetCall[] = [];
  return {
    calls,
    api: {
      get: async (filter: CookiesGetCall): Promise<ElectronCookieShape[]> => {
        calls.push(filter);
        return impl(filter);
      },
    },
  };
}

describe('tryCaptureCookies (issue #16, AUTH-02, AUTH-06)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls cookies.get with { url } not { domain } — issue #16 regression', async () => {
    const handle = fakeCookies(async () => [
      { name: 'LEETCODE_SESSION', value: 'S', domain: '.leetcode.com' },
      { name: 'csrftoken', value: 'C', domain: '.leetcode.com' },
    ]);

    const result = await tryCaptureCookies(handle.api, 'com');

    expect(handle.calls).toHaveLength(1);
    const filter = handle.calls[0];
    expect(filter).toEqual({ url: 'https://leetcode.com/' });
    // Explicit guard against regression — if someone re-adds a domain field
    // next to url in a future "helpful" PR, this assertion catches it.
    expect(filter?.domain).toBeUndefined();
    expect(result).toEqual({ LEETCODE_SESSION: 'S', csrftoken: 'C' });
  });

  it('captures host-only csrftoken (no Domain attribute) — the actual issue #16 scenario', async () => {
    // LC sometimes returns csrftoken as a host-only cookie (no domain field /
    // no leading dot). With { domain: '.leetcode.com' }, Electron omitted it.
    // With { url: 'https://leetcode.com/' }, Electron returns it because it
    // would be sent on a request to that origin.
    const handle = fakeCookies(async () => [
      { name: 'LEETCODE_SESSION', value: 'SessionVal', domain: '.leetcode.com' },
      // Host-only — no domain field.
      { name: 'csrftoken', value: 'CsrfHostOnly' },
    ]);

    const result = await tryCaptureCookies(handle.api, 'com');

    expect(result).toEqual({
      LEETCODE_SESSION: 'SessionVal',
      csrftoken: 'CsrfHostOnly',
    });
  });

  it('returns null when csrftoken missing', async () => {
    const handle = fakeCookies(async () => [
      { name: 'LEETCODE_SESSION', value: 'S', domain: '.leetcode.com' },
    ]);

    const result = await tryCaptureCookies(handle.api, 'com');

    expect(result).toBeNull();
  });

  it('swallows transient cookies.get rejections (AUTH-06 — never log)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const handle = fakeCookies(async () => {
      throw new Error('transient');
    });

    const result = await tryCaptureCookies(handle.api, 'com');

    expect(result).toBeNull();
    // AUTH-06: catch is bare — never logs error message, cookie list, or
    // filter contents. The next event will retry in production.
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });
});
