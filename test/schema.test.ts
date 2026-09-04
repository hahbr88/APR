import test from 'node:test';
import assert from 'node:assert/strict';
import { classificationBodySchema, itemsBodySchema, transactionSchema } from '../shared/schemas.js';
import { applicationPeriodFromReceiptDate, tripPeriodFromDateRange } from '../client/src/lib/dates.js';
import { expenseResolutionFilename } from '../shared/filenames.js';

const transaction = {
  id: 'transaction-1', sourceFile: 'card.xlsx', sourceRow: 2, cardCompany: '삼성카드', cardNumber: '1234****',
  transactionAt: '2026-08-28T09:10:00', merchant: '철도승차권결제', amount: 18200, approvalNumber: '12345678',
  status: '승인', cancellationDate: '', installment: '일시불', cancelled: false, parseErrors: [], fingerprint: 'key',
  category: '교통비', categorySource: 'rule' as const, selected: true, customer: '국세청', businessType: '프로젝트' as const,
  region: '지방' as const, reason: '출장 교통비', actualAmount: 18200, claimAmount: 18200, tripPeriod: '26.08.25-26.08.28',
};

test('정상 거래와 문서 요청을 검증한다', () => {
  assert.equal(itemsBodySchema.safeParse({ items: [transaction], document: { applicant: '테스트', receiptDate: '2026-08-28', periodStart: '', periodEnd: '' } }).success, true);
});

test('음수 청구금액과 정의되지 않은 요청 필드를 거부한다', () => {
  assert.equal(transactionSchema.safeParse({ ...transaction, claimAmount: -1 }).success, false);
  assert.equal(transactionSchema.safeParse({ ...transaction, status: '전체취소', cancelled: true, amount: -18200, actualAmount: -18200, claimAmount: -18200 }).success, true);
  assert.equal(classificationBodySchema.safeParse({ merchant: '철도승차권결제', category: '교통비', unexpected: true }).success, false);
});

test('접수일을 기준으로 전월 같은 날짜 다음 날부터 신청기간을 계산한다', () => {
  assert.deepEqual(applicationPeriodFromReceiptDate('2026-09-20'), { periodStart: '2026-08-21', periodEnd: '2026-09-20' });
  assert.deepEqual(applicationPeriodFromReceiptDate('2026-01-20'), { periodStart: '2025-12-21', periodEnd: '2026-01-20' });
  assert.deepEqual(applicationPeriodFromReceiptDate('2026-03-31'), { periodStart: '2026-03-01', periodEnd: '2026-03-31' });
  assert.equal(applicationPeriodFromReceiptDate('2026-02-30'), null);
});

test('접수일과 접수자로 안전한 지출결의서 파일명을 만든다', () => {
  assert.equal(expenseResolutionFilename({ receiptDate: '2026-09-20', applicant: '홍길동' }), '지출결의서_20260920_홍길동.xlsx');
  assert.equal(expenseResolutionFilename({ receiptDate: '2026-09-20', applicant: '홍/길동' }), '지출결의서_20260920_홍_길동.xlsx');
  assert.equal(expenseResolutionFilename({ receiptDate: '2026-09-20', applicant: '' }), '지출결의서_20260920_미입력.xlsx');
});

test('출장 날짜 범위를 엑셀 표시 형식으로 변환한다', () => {
  assert.equal(tripPeriodFromDateRange('2026-08-21', '2026-09-04'), '26.08.21-26.09.04');
  assert.equal(tripPeriodFromDateRange('2026-12-31', '2027-01-02'), '26.12.31-27.01.02');
  assert.equal(tripPeriodFromDateRange('', ''), '');
  assert.equal(tripPeriodFromDateRange('2026-09-04', ''), null);
  assert.equal(tripPeriodFromDateRange('2026-09-05', '2026-09-04'), null);
});
