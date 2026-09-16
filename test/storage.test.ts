import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { aiSettingsStore, configureStorageDirectory, settingsStore } from '../src/storage.js';

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

test('AI 작성 기준을 API 키와 분리된 로컬 설정 파일에 저장한다', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'auto-payment-request-ai-settings-'));
  configureStorageDirectory(directory);
  try {
    const initial = await aiSettingsStore.all();
    assert.equal(initial.enabled, false);
    assert.equal(initial.provider, 'groq');
    assert.equal(initial.model, 'openai/gpt-oss-20b');
    const saved = await aiSettingsStore.save({ ...initial, companyGuidelines: '확인되지 않은 출장 목적은 추측하지 않는다.' });
    assert.equal(saved.companyGuidelines, '확인되지 않은 출장 목적은 추측하지 않는다.');
    assert.equal(JSON.stringify(saved).includes('apiKey'), false);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('이전 AI 설정의 작성 예시 필드를 제거하고 불러온다', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'auto-payment-request-ai-migration-'));
  configureStorageDirectory(directory);
  try {
    await fs.writeFile(path.join(directory, 'ai-settings.json'), JSON.stringify({
      ...await aiSettingsStore.all(),
      examples: '이전에 저장한 예시',
    }), 'utf8');
    const migrated = await aiSettingsStore.all();
    assert.equal('examples' in migrated, false);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
