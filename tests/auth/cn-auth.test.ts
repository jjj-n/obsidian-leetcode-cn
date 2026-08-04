// tests/auth/cn-auth.test.ts
// Ticket #2: cn auth transport + login.
// Tests for BrowserWindowLogin region-aware cookie capture + login URL,
// and LeetCodeClient region-aware reauthenticate + fetchWhoami.
import { describe, it, expect, vi } from 'vitest';
import { tryCaptureCookies } from '../../src/auth/BrowserWindowLogin';
import type { ElectronCookiesApi } from '../../src/auth/BrowserWindowLogin';

// ---------------------------------------------------------------------------
// tryCaptureCookies — region-aware URL filter
// ---------------------------------------------------------------------------

describe('tryCaptureCookies — region-aware URL filter', () => {
  it('uses leetcode.cn URL filter when region is cn', async () => {
    const cookiesApi: ElectronCookiesApi = {
      get: vi.fn(async (filter) => {
        expect(filter.url).toBe('https://leetcode.cn/');
        return [
          { name: 'LEETCODE_SESSION', value: 'sess' },
          { name: 'csrftoken', value: 'csrf' },
        ];
      }),
    };
    const result = await tryCaptureCookies(cookiesApi, 'cn');
    expect(result).toEqual({ LEETCODE_SESSION: 'sess', csrftoken: 'csrf' });
  });

  it('uses leetcode.com URL filter when region is com', async () => {
    const cookiesApi: ElectronCookiesApi = {
      get: vi.fn(async (filter) => {
        expect(filter.url).toBe('https://leetcode.com/');
        return [
          { name: 'LEETCODE_SESSION', value: 'sess' },
          { name: 'csrftoken', value: 'csrf' },
        ];
      }),
    };
    const result = await tryCaptureCookies(cookiesApi, 'com');
    expect(result).toEqual({ LEETCODE_SESSION: 'sess', csrftoken: 'csrf' });
  });

  it('defaults to leetcode.cn when no region provided (backward compat)', async () => {
    const cookiesApi: ElectronCookiesApi = {
      get: vi.fn(async (filter) => {
        expect(filter.url).toBe('https://leetcode.cn/');
        return [
          { name: 'LEETCODE_SESSION', value: 'sess' },
          { name: 'csrftoken', value: 'csrf' },
        ];
      }),
    };
    const result = await tryCaptureCookies(cookiesApi);
    expect(result).toEqual({ LEETCODE_SESSION: 'sess', csrftoken: 'csrf' });
  });
});
