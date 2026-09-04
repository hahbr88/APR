import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMerchant, recommendCategory, transactionFingerprint } from '../src/classifier.js';

test('철도와 편의점 가맹점을 기본 규칙으로 분류한다', () => {
  assert.equal(recommendCategory('철도승차권결제').category, '교통비');
  assert.equal(recommendCategory('GS25 방배내방점').category, '식대/소모품비');
});

test('기억한 분류가 기본 규칙보다 우선한다', () => {
  const remembered = { [normalizeMerchant('GS25 방배내방점')]: '소모품비' };
  assert.deepEqual(recommendCategory('GS25 방배내방점', remembered), {
    category: '소모품비', source: 'remembered',
  });
});

test('동일 거래는 동일한 중복 식별값을 만든다', () => {
  const transaction = {
    cardCompany: '삼성카드', cardNumber: '1234****', approvalNumber: '00112233',
    transactionAt: '2026-08-21T10:45:00', amount: 18200,
  };
  assert.equal(transactionFingerprint(transaction), transactionFingerprint({ ...transaction }));
});
