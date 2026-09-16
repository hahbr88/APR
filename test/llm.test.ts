import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_AI_PREFERENCES, type Transaction } from '../shared/schemas.js';
import { getLlmProvider } from '../src/llm/providers.js';
import { maskedKey } from '../src/llm/secrets.js';

const transaction: Transaction = {
  id: 'transaction-1', sourceFile: 'private-card.xlsx', sourceRow: 4, cardCompany: '현대카드', cardNumber: '1234-****-****-5678',
  transactionAt: '2026-08-28T12:30:00', merchant: '한국철도공사', amount: 18200, approvalNumber: 'secret-approval',
  status: '승인', cancellationDate: '', installment: '일시불', cancelled: false, parseErrors: [], fingerprint: 'private-fingerprint',
  category: '기타', categorySource: 'default', selected: true, customer: '비공개 고객사', businessType: '프로젝트', region: '지방',
  reason: '한국철도공사', actualAmount: 18200, claimAmount: 18200, tripPeriod: '',
};

test('API 키 마스킹은 마지막 네 글자만 표시한다', () => {
  assert.equal(maskedKey('secret-api-key-1234'), '••••1234');
  assert.equal(maskedKey(null), null);
});

test('Gemini 요청에서 결제 식별정보를 제외하고 구조화된 추천을 읽는다', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = '';
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    requestBody = String(init?.body || '');
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify([{ id: transaction.id, category: '점심식대', reason: '프로젝트 회의 전 간단 점심' }]) }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  try {
    const result = await getLlmProvider('gemini').suggest('test-key', { ...DEFAULT_AI_PREFERENCES, provider: 'gemini', model: 'gemini-3.8-flash' }, [transaction]);
    assert.equal(result[0]?.category, '점심식대');
    assert.equal(result[0]?.reason, '점심 식사');
    assert.equal(result[0]?.needsReview, true);
    assert.equal(requestBody.includes(transaction.merchant), true);
    assert.equal(requestBody.includes(transaction.cardNumber), false);
    assert.equal(requestBody.includes(transaction.approvalNumber), false);
    assert.equal(requestBody.includes(transaction.sourceFile), false);
    assert.equal(requestBody.includes(transaction.customer), false);
    assert.equal(requestBody.includes(`\"currentReason\":\"${transaction.reason}\"`), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('종합 판매처가 반환한 구체적인 품목을 일반 사유로 바꾸고 확인 대상으로 표시한다', async () => {
  const originalFetch = globalThis.fetch;
  const onlineStore = { ...transaction, id: 'transaction-coupang', merchant: '쿠팡', category: '소모품비' as const };
  globalThis.fetch = (async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify([
    { id: onlineStore.id, category: '소모품비', reason: '사무용 프린터 잉크 주문' },
  ]) }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
  try {
    const result = await getLlmProvider('gemini').suggest('test-key', { ...DEFAULT_AI_PREFERENCES, provider: 'gemini', model: 'gemini-3.8-flash' }, [onlineStore]);
    assert.equal(result[0]?.reason, '사무용 소모품 구입');
    assert.equal(result[0]?.needsReview, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('비케이알을 버거킹 식사 거래로 보수적으로 정규화한다', async () => {
  const originalFetch = globalThis.fetch;
  const burgerKing = { ...transaction, id: 'transaction-bkr', merchant: '주식회사 비케이알', transactionAt: '2026-08-25T20:10:00' };
  globalThis.fetch = (async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify([
    { id: burgerKing.id, category: '소모품비', reason: '사무용 스테이플러 구매' },
  ]) }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
  try {
    const result = await getLlmProvider('gemini').suggest('test-key', { ...DEFAULT_AI_PREFERENCES, provider: 'gemini', model: 'gemini-3.8-flash' }, [burgerKing]);
    assert.equal(result[0]?.category, '저녁식대');
    assert.equal(result[0]?.reason, '저녁 식사');
    assert.equal(result[0]?.needsReview, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Groq 공급자도 동일한 추천 형식과 개인정보 제외 규칙을 사용한다', async () => {
  const originalFetch = globalThis.fetch;
  const omittedTransaction = { ...transaction, id: 'transaction-2', merchant: '응답에서 누락될 거래' };
  let requestBody = '';
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    requestBody = String(init?.body || '');
    return new Response(JSON.stringify({ output: [
      { type: 'reasoning', content: [{ type: 'reasoning_text', text: 'internal reasoning is not JSON' }] },
      { type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ suggestions: [{ id: transaction.id, category: '교통비', reason: transaction.merchant }] }) }] },
    ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  try {
    const result = await getLlmProvider('groq').suggest('test-key', { ...DEFAULT_AI_PREFERENCES, provider: 'groq', model: 'openai/gpt-oss-20b' }, [transaction, omittedTransaction]);
    assert.equal(result[0]?.reason, '철도 이용');
    assert.equal(result.length, 1);
    assert.equal(requestBody.includes(transaction.merchant), true);
    assert.equal(requestBody.includes(transaction.cardNumber), false);
    assert.equal(requestBody.includes(transaction.approvalNumber), false);
    assert.equal(requestBody.includes(transaction.fingerprint), false);
    assert.equal(requestBody.includes(transaction.customer), false);
    const body = JSON.parse(requestBody) as { text: { format: { schema: { type: string } } } };
    assert.equal(body.text.format.schema.type, 'object');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
