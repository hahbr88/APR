import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { configureStorageDirectory, settingsStore } from '../src/storage.js';

test('접수자 설정을 지정한 로컬 데이터 폴더에 저장하고 다시 읽는다', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'auto-payment-request-settings-'));
  configureStorageDirectory(directory);
  try {
    assert.deepEqual(await settingsStore.all(), { rememberedApplicant: null });
    assert.deepEqual(await settingsStore.save({ rememberedApplicant: '하병노' }), { rememberedApplicant: '하병노' });
    assert.deepEqual(await settingsStore.all(), { rememberedApplicant: '하병노' });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
