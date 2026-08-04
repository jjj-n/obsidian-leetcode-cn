// src/auth/AuthService.ts
// Orchestrates login/logout. Uses BrowserWindowLogin for the embedded flow and
// SettingsStore for persistence. Emits exactly one Notice per event class (D-04).
// All user-facing strings are LOCKED by UI-SPEC.md § Notice messages — do not paraphrase.
//
// Ownership boundary (AUTH-04): `isSessionExpired` is defined ONLY in
// src/api/LeetCodeClient.ts (Plan 02). This file does NOT redefine it; Plan 06
// wires the end-to-end expiry → logout → Notice flow.
import { Notice } from 'obsidian';
import type { SettingsStore } from '../settings/SettingsStore';
import type { LeetCodeClient } from '../api/LeetCodeClient';
import { openLogin, clearLeetCodePartitionCookies } from './BrowserWindowLogin';
import type { AuthCookies } from './types';

export class AuthService {
  constructor(
    private readonly settings: SettingsStore,
    private readonly client: LeetCodeClient,
  ) {}

  /**
   * Open embedded LC login; persist cookies on success.
   * Returns true if cookies were captured + persisted, false if cancelled.
   * AUTH-01, AUTH-02.
   */
  async login(): Promise<boolean> {
    const result = await openLogin(this.settings.getRegion());
    switch (result.kind) {
      case 'cancelled': {
        // D-04 silent cancel: exactly ONE Notice, no modal stacking, no auto-pivot to paste.
        // UI-SPEC.md Notice table — LOCKED copy; "LeetCode" is a proper-noun brand name.

        new Notice('LeetCode login cancelled.', 4000);
        return false;
      }
      case 'timeout': {
        // Issue #16: distinct from 'cancelled' so the user sees an actionable
        // hint instead of a misleading "cancelled" message when cookie capture
        // never succeeds within 30s (e.g., future cookie-jar quirks).
        // NEW copy — pending UI-SPEC.md ratification.

        new Notice(
          'Login appeared to succeed but cookies could not be captured — try the manual paste fallback in settings.',
          7000,
        );
        return false;
      }
      case 'success':
        // Fall through to the existing persist / reauthenticate / whoami flow below.
        break;
    }
    const cookies = result.cookies;
    await this.settings.setAuthCookies(cookies);
    await this.client.reauthenticate();
    // Fetch and persist username for settings tab display (previously left null,
    // showing "Logged in as …" forever). whoami is a lightweight GraphQL query;
    // if it fails we persist null so the UI falls back to the placeholder.
    const who = await this.client.fetchWhoami();
    await this.settings.setUsername(who?.username ?? null);
    await this.settings.setIsPremium(who?.isPremium ?? null);
     
    new Notice('Logged in to LeetCode.', 4000);
    return true;
  }

  /** Persist manually-pasted cookies (AUTH-03 fallback). */
  async loginManual(cookies: AuthCookies): Promise<void> {
    await this.settings.setAuthCookies(cookies);
    await this.client.reauthenticate();
    const who = await this.client.fetchWhoami();
    await this.settings.setUsername(who?.username ?? null);
    await this.settings.setIsPremium(who?.isPremium ?? null);
    new Notice('Cookies saved.', 3000);
  }

  /**
   * Clear cookies from data.json AND the Electron persist:leetcode partition
   * cookie jar (AUTH-05). Without the partition clear, the next BrowserWindow
   * login auto-signs-in using cached partition cookies — user sees a blank
   * LC page briefly and gets re-logged-in as the same account with no password
   * prompt. RESEARCH.md Open Question 2 was resolved to "Phase 1 clears
   * data.json only" for the initial ship; promoted to full clear here because
   * users testing in a real vault hit this immediately and it looks like a bug.
   */
  async logout(): Promise<void> {
    await this.settings.setAuthCookies(null);
    await this.settings.setUsername(null);
    await this.settings.setIsPremium(null);
    await this.client.reauthenticate();
    await clearLeetCodePartitionCookies();
     
    new Notice('Logged out of LeetCode.', 4000);
  }

  isLoggedIn(): boolean {
    return this.settings.getAuthCookies() !== null;
  }
}
