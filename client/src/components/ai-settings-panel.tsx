import { useEffect, useState } from 'react';
import { KeyRound, LoaderCircle, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AiSettingsResponse, AiSettingsUpdate, LlmProviderName } from '../../../shared/schemas';

const defaultModels: Record<LlmProviderName, string> = { groq: 'openai/gpt-oss-20b', gemini: 'gemini-3.8-flash' };
const modelOptions: Record<LlmProviderName, Array<{ value: string; label: string }>> = {
  groq: [
    { value: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B (권장 · 빠름)' },
    { value: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B (정확도 우선)' },
    { value: 'qwen/qwen3.8-27b', label: 'Qwen 3.8 27B (미리보기)' },
  ],
  gemini: [
    { value: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
    { value: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
  ],
};

function editableSettings(settings: AiSettingsResponse): AiSettingsUpdate {
  const { keyConfigured: _keyConfigured, keyHint: _keyHint, persistentKeyStorage: _persistentKeyStorage, ...preferences } = settings;
  return preferences;
}

export function AiSettingsPanel({ settings, busy, onClose, onSave, onTest, onDeleteKey }: {
  settings: AiSettingsResponse;
  busy: boolean;
  onClose: () => void;
  onSave: (settings: AiSettingsUpdate) => Promise<void>;
  onTest: (settings: AiSettingsUpdate) => Promise<boolean>;
  onDeleteKey: () => Promise<void>;
}) {
  const [values, setValues] = useState<AiSettingsUpdate>(() => editableSettings(settings));
  const [apiKey, setApiKey] = useState('');
  const [verifiedSignature, setVerifiedSignature] = useState<string | null>(() => settings.keyConfigured ? `${settings.provider}|${settings.model}|stored` : null);
  const providerHasStoredKey = settings.provider === values.provider && settings.keyConfigured;
  const connectionSignature = `${values.provider}|${values.model}|${apiKey.trim() || (providerHasStoredKey ? 'stored' : 'missing')}`;
  const connectionVerified = verifiedSignature === connectionSignature;
  useEffect(() => {
    setValues(editableSettings(settings));
    setApiKey('');
    setVerifiedSignature(settings.keyConfigured ? `${settings.provider}|${settings.model}|stored` : null);
  }, [settings]);

  function changeProvider(provider: LlmProviderName) {
    setValues((current) => ({ ...current, provider, model: defaultModels[provider], enabled: false }));
    setApiKey('');
  }

  async function testConnection() {
    const tested = await onTest({ ...values, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) });
    if (tested) setVerifiedSignature(connectionSignature);
  }

  return <><button type="button" className="fixed inset-0 z-40 cursor-default bg-black/20" aria-label="AI 설정 닫기" onClick={onClose} />
    <aside className="fixed inset-y-0 right-0 z-50 w-[520px] overflow-y-auto border-l bg-background shadow-2xl" role="dialog" aria-modal="true" aria-label="AI 자동완성 설정">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-6 py-4"><div><p className="font-semibold">AI 자동완성 설정</p><p className="text-xs text-muted-foreground">사용할 때만 거래 정보가 선택한 AI 서비스로 전송됩니다.</p></div><Button type="button" size="icon" variant="ghost" aria-label="닫기" onClick={onClose}><X /></Button></div>
      <div className="grid gap-6 p-6">
        <label className="flex items-start gap-3 rounded-lg border p-4"><Checkbox className="mt-0.5" checked={values.enabled} disabled={!providerHasStoredKey && !apiKey} onCheckedChange={(checked) => setValues({ ...values, enabled: checked === true })} /><span><strong className="block text-sm">AI 자동완성 사용</strong><span className="text-xs text-muted-foreground">꺼져 있으면 AI 요청 버튼과 외부 전송이 비활성화됩니다.</span></span></label>
        <div className="grid grid-cols-2 gap-4">
          <Field label="공급자"><select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={values.provider} onChange={(event) => changeProvider(event.target.value as LlmProviderName)}><option value="groq">Groq (권장)</option><option value="gemini">Gemini</option></select></Field>
          <Field label="모델"><select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={values.model} onChange={(event) => setValues({ ...values, model: event.target.value })}>{modelOptions[values.provider].map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}</select></Field>
        </div>
        <Field label="개인 API 키">
          <Input type="password" value={apiKey} autoComplete="off" placeholder={providerHasStoredKey ? settings.keyHint || '저장된 API 키' : 'API 키 입력'} onChange={(event) => setApiKey(event.target.value)} />
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{providerHasStoredKey ? <Badge variant="secondary"><KeyRound />{settings.keyHint} 저장됨</Badge> : '현재 공급자에 저장된 키가 없습니다.'}{!settings.persistentKeyStorage && ' 브라우저 개발 모드에서는 실행 중에만 유지됩니다.'}</span>{providerHasStoredKey && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void onDeleteKey()}><Trash2 />키 삭제</Button>}</div>
        </Field>
        <Field label="회사 작성 기준"><textarea className="min-h-28 rounded-md border bg-background px-3 py-2 text-sm" maxLength={5000} value={values.companyGuidelines} placeholder="회사 경비 처리와 상세 사유 작성 원칙을 입력하세요." onChange={(event) => setValues({ ...values, companyGuidelines: event.target.value })} /></Field>
        <Field label="구분별 판단 기준"><textarea className="min-h-32 rounded-md border bg-background px-3 py-2 text-sm" maxLength={5000} value={values.categoryGuidelines} placeholder="교통비, 식대, 소모품비 등을 판단하는 기준을 입력하세요." onChange={(event) => setValues({ ...values, categoryGuidelines: event.target.value })} /></Field>
        <Field label="상세 사유 최대 글자 수"><Input className="w-28" type="number" min={5} max={100} value={values.reasonMaxLength} onChange={(event) => setValues({ ...values, reasonMaxLength: Number(event.target.value) })} /></Field>
        <div className="rounded-lg bg-muted p-3 text-xs leading-5 text-muted-foreground">AI에는 가맹점명, 거래 일시, 금액, 할부 정보, 현재 구분, 업무·지역 정보만 전달합니다. 카드번호·승인번호·원본 파일명은 전송하지 않습니다.</div>
      </div>
      <div className="sticky bottom-0 border-t bg-background px-6 py-4"><div className="mb-3 text-right text-xs"><span className={connectionVerified ? 'text-emerald-700' : 'text-amber-700'}>{connectionVerified ? '연결 확인됨 · 설정을 저장할 수 있습니다.' : '공급자·API 키·모델의 연결 테스트가 필요합니다.'}</span></div><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy || (!providerHasStoredKey && !apiKey)} onClick={() => void testConnection()}>{busy && <LoaderCircle className="animate-spin" />}연결 테스트</Button><Button type="button" disabled={busy || !connectionVerified} title={connectionVerified ? undefined : '연결 테스트를 먼저 완료해 주세요.'} onClick={() => void onSave({ ...values, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) })}>{busy && <LoaderCircle className="animate-spin" />}설정 저장</Button></div></div>
    </aside></>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-2"><Label>{label}</Label>{children}</div>;
}
