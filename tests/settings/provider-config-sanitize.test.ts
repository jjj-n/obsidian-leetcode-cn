// tests/settings/provider-config-sanitize.test.ts
// Sanitize-guard coverage for providerConfigs on load (data.json corruption
// posture, T-07-01). These guards were refactored during the lint sweep and
// previously had zero direct coverage.
import { describe, it, expect, vi } from 'vitest';
import { SettingsStore } from '../../src/settings/SettingsStore';
import type { BedrockProviderConfig } from '../../src/settings/SettingsStore';

function makeMockPlugin(initial: unknown = null) {
  const state: { data: unknown } = { data: initial };
  return {
    loadData: vi.fn(async () => state.data),
    saveData: vi.fn(async (d: unknown) => { state.data = d; }),
  };
}

const ANTHROPIC_DEFAULT = {
  apiKey: '',
  baseUrl: 'https://api.anthropic.com/v1',
  model: 'claude-haiku-4-5',
  disclosureAcknowledged: false,
};

describe('SettingsStore — provider config sanitize guards', () => {
  it('missing providerConfigs collapses every provider to its defaults', async () => {
    const s = await SettingsStore.load(makeMockPlugin({ version: 1 }) as never);
    expect(s.getProviderConfig('anthropic')).toEqual(ANTHROPIC_DEFAULT);
  });

  it('non-object provider entry collapses to defaults (no throw)', async () => {
    const s = await SettingsStore.load(makeMockPlugin({
      version: 1,
      providerConfigs: { anthropic: 42 },
    }) as never);
    expect(s.getProviderConfig('anthropic')).toEqual(ANTHROPIC_DEFAULT);
  });

  it('valid config round-trips field-for-field', async () => {
    const s = await SettingsStore.load(makeMockPlugin({
      version: 1,
      providerConfigs: {
        anthropic: {
          apiKey: 'sk-test',
          baseUrl: 'https://api.anthropic.com/v1',
          model: 'my-model',
          disclosureAcknowledged: true,
        },
      },
    }) as never);
    expect(s.getProviderConfig('anthropic')).toEqual({
      apiKey: 'sk-test',
      baseUrl: 'https://api.anthropic.com/v1',
      model: 'my-model',
      disclosureAcknowledged: true,
    });
  });

  it('field-level collapse: wrong types fall back per-field, not whole-config', async () => {
    const s = await SettingsStore.load(makeMockPlugin({
      version: 1,
      providerConfigs: {
        anthropic: {
          apiKey: 1234,                    // non-string → ''
          baseUrl: 'ftp://evil.example',   // non-http(s) → default
          model: '',                       // empty → default
          disclosureAcknowledged: 'yes',   // strict-true only → false
        },
      },
    }) as never);
    expect(s.getProviderConfig('anthropic')).toEqual(ANTHROPIC_DEFAULT);
  });

  it("ollama's http://localhost baseUrl survives the http(s):// check", async () => {
    const s = await SettingsStore.load(makeMockPlugin({
      version: 1,
      providerConfigs: {
        ollama: {
          apiKey: '',
          baseUrl: 'http://my-host:11434/v1',
          model: 'llama3.2',
          disclosureAcknowledged: false,
        },
      },
    }) as never);
    expect(s.getProviderConfig('ollama').baseUrl).toBe('http://my-host:11434/v1');
  });

  it('bedrock: invalid authMethod collapses to default-chain; valid one and secrets survive', async () => {
    const s = await SettingsStore.load(makeMockPlugin({
      version: 1,
      providerConfigs: {
        bedrock: {
          apiKey: '',
          baseUrl: '',
          model: '',
          disclosureAcknowledged: true,
          region: '',
          modelId: '',
          authMethod: 'magic-wand',   // invalid → default-chain
          accessKeyId: 'AKIA-kept',
          secretAccessKey: 'kept',
          ssoProfile: 'kept',
          bedrockApiKey: 'kept',
          sessionToken: 'kept',
        },
      },
    }) as never);
    const b = s.getProviderConfig('bedrock') as BedrockProviderConfig;
    expect(b.authMethod).toBe('default-chain');
    // Per-default fallbacks for empty region/modelId.
    expect(b.region).toBe('us-east-1');
    expect(b.modelId).toBe('us.anthropic.claude-sonnet-4-6');
    // Strict-true disclosure survives.
    expect(b.disclosureAcknowledged).toBe(true);
    // Secrets preserved verbatim regardless of authMethod (Pitfall 10).
    expect(b.accessKeyId).toBe('AKIA-kept');
    expect(b.secretAccessKey).toBe('kept');
    expect(b.ssoProfile).toBe('kept');
    expect(b.bedrockApiKey).toBe('kept');
    expect(b.sessionToken).toBe('kept');
  });

  it('bedrock: valid sso-profile authMethod round-trips', async () => {
    const s = await SettingsStore.load(makeMockPlugin({
      version: 1,
      providerConfigs: {
        bedrock: {
          apiKey: '', baseUrl: '', model: '', disclosureAcknowledged: false,
          region: 'ap-northeast-1',
          modelId: 'custom-model',
          authMethod: 'sso-profile',
          accessKeyId: '', secretAccessKey: '', ssoProfile: 'prod',
          bedrockApiKey: '', sessionToken: '',
        },
      },
    }) as never);
    const b = s.getProviderConfig('bedrock') as BedrockProviderConfig;
    expect(b.authMethod).toBe('sso-profile');
    expect(b.region).toBe('ap-northeast-1');
    expect(b.modelId).toBe('custom-model');
    expect(b.ssoProfile).toBe('prod');
  });
});
