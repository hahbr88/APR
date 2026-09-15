import { safeStorage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { LlmProviderName } from '../shared/schemas.js';
import { configureLlmSecretStore, type LlmSecretStore } from '../src/llm/secrets.js';

type EncryptedKeys = Partial<Record<LlmProviderName, string>>;

export function configureEncryptedLlmKeys(dataDirectory: string): void {
  const keyFile = path.join(dataDirectory, 'llm-keys.json');

  async function read(): Promise<EncryptedKeys> {
    try {
      return JSON.parse(await fs.readFile(keyFile, 'utf8')) as EncryptedKeys;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
  }

  async function write(keys: EncryptedKeys): Promise<void> {
    await fs.mkdir(dataDirectory, { recursive: true });
    const temporary = `${keyFile}.${process.pid}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(keys), 'utf8');
    await fs.rename(temporary, keyFile);
  }

  const store: LlmSecretStore = {
    persistent: true,
    async get(provider) {
      const encrypted = (await read())[provider];
      if (!encrypted) return null;
      const decrypted = await safeStorage.decryptStringAsync(Buffer.from(encrypted, 'base64'));
      if (decrypted.shouldReEncrypt) await this.set(provider, decrypted.result);
      return decrypted.result;
    },
    async set(provider, value) {
      if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('운영체제의 안전한 키 저장소를 사용할 수 없습니다.');
      const keys = await read();
      keys[provider] = (await safeStorage.encryptStringAsync(value)).toString('base64');
      await write(keys);
    },
    async remove(provider) {
      const keys = await read();
      delete keys[provider];
      await write(keys);
    },
  };
  configureLlmSecretStore(store);
}
