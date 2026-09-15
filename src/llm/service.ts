import { aiPreferencesSchema, type AiSettingsResponse, type AiSettingsUpdate, type AiSuggestion, type Transaction } from '../../shared/schemas.js';
import { aiSettingsStore } from '../storage.js';
import { getLlmProvider } from './providers.js';
import { getLlmSecretStore, maskedKey } from './secrets.js';

export async function getAiSettings(): Promise<AiSettingsResponse> {
  const preferences = await aiSettingsStore.all();
  const secrets = getLlmSecretStore();
  const apiKey = await secrets.get(preferences.provider);
  return { ...preferences, keyConfigured: Boolean(apiKey), keyHint: maskedKey(apiKey), persistentKeyStorage: secrets.persistent };
}

export async function saveAiSettings(update: AiSettingsUpdate): Promise<AiSettingsResponse> {
  const { apiKey, ...preferenceValues } = update;
  const preferences = aiPreferencesSchema.parse(preferenceValues);
  const secrets = getLlmSecretStore();
  if (apiKey) await secrets.set(preferences.provider, apiKey);
  if (preferences.enabled && !(await secrets.get(preferences.provider))) {
    throw new Error('AI 자동완성을 켜려면 선택한 공급자의 API 키를 입력해 주세요.');
  }
  await aiSettingsStore.save(preferences);
  return getAiSettings();
}

export async function removeAiKey(): Promise<AiSettingsResponse> {
  const preferences = await aiSettingsStore.all();
  await getLlmSecretStore().remove(preferences.provider);
  if (preferences.enabled) await aiSettingsStore.save({ ...preferences, enabled: false });
  return getAiSettings();
}

export async function testAiConnection(update: AiSettingsUpdate): Promise<void> {
  const { apiKey: suppliedKey, ...preferenceValues } = update;
  const preferences = aiPreferencesSchema.parse(preferenceValues);
  const apiKey = suppliedKey || await getLlmSecretStore().get(preferences.provider);
  if (!apiKey) throw new Error('먼저 API 키를 입력하고 저장해 주세요.');
  await getLlmProvider(preferences.provider).test(apiKey, preferences.model);
}

export async function suggestTransactions(transactions: Transaction[]): Promise<AiSuggestion[]> {
  const preferences = await aiSettingsStore.all();
  if (!preferences.enabled) throw new Error('AI 자동완성 기능이 꺼져 있습니다.');
  const apiKey = await getLlmSecretStore().get(preferences.provider);
  if (!apiKey) throw new Error('AI 공급자의 API 키가 설정되지 않았습니다.');
  const eligible = transactions.filter((item) => !item.cancelled && !item.cancelledBy && !item.parseErrors.length);
  if (!eligible.length) throw new Error('AI가 추천할 수 있는 거래가 없습니다.');
  return getLlmProvider(preferences.provider).suggest(apiKey, preferences, eligible);
}
