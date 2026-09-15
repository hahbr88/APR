import type { LlmProviderName } from '../../shared/schemas.js';

export interface LlmSecretStore {
  persistent: boolean;
  get(provider: LlmProviderName): Promise<string | null>;
  set(provider: LlmProviderName, value: string): Promise<void>;
  remove(provider: LlmProviderName): Promise<void>;
}

const sessionKeys = new Map<LlmProviderName, string>();
const environmentNames: Record<LlmProviderName, string> = { gemini: 'GEMINI_API_KEY', groq: 'GROQ_API_KEY' };

let secretStore: LlmSecretStore = {
  persistent: false,
  async get(provider) {
    return sessionKeys.get(provider) || process.env[environmentNames[provider]] || null;
  },
  async set(provider, value) {
    sessionKeys.set(provider, value);
  },
  async remove(provider) {
    sessionKeys.delete(provider);
  },
};

export function configureLlmSecretStore(store: LlmSecretStore): void {
  secretStore = store;
}

export function getLlmSecretStore(): LlmSecretStore {
  return secretStore;
}

export function maskedKey(value: string | null): string | null {
  if (!value) return null;
  return `••••${value.slice(-4)}`;
}
