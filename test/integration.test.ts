import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { linkCancellations, markDuplicates, parseCardFile } from '../src/parsers.js';
import { createPaymentRequest, validateAndPreview } from '../src/exporter.js';
import { itemsBodySchema } from '../shared/schemas.js';
import type { UploadedCardFile } from '../src/types.js';

const examples = [
  ['Shinhancard_20260828.xlsx', '신한카드'],
  ['일시불+할부_카드이용내역조회.xlsx', '삼성카드'],
  ['hyundaicard_20260828.xls', '현대카드'],
  ['현대카드.xlsx', '현대카드'],
] as const;

async function exampleFile(filename: string): Promise<UploadedCardFile> {
  return {
    originalname: filename,
    buffer: await fs.readFile(path.resolve('assets/ex', filename)),
  };
}

function formulaResult(cell: ExcelJS.Cell): unknown {
  const value = cell.value;
  return typeof value === 'object' && value !== null && 'result' in value ? value.result : undefined;
}

function formula(cell: ExcelJS.Cell): unknown {
  const value = cell.value;
  return typeof value === 'object' && value !== null && 'formula' in value ? value.formula : undefined;
}

test('예시 카드사 파일을 형식과 관계없이 공통 거래 형식으로 읽는다', async () => {
  for (const [filename, cardCompany] of examples) {
    const transactions = await parseCardFile(await exampleFile(filename));
    assert.ok(transactions.length > 0, `${filename}에 거래가 있어야 합니다.`);
    assert.equal(transactions[0]?.cardCompany, cardCompany);
    assert.ok(transactions[0]?.merchant);
    assert.ok(transactions[0]?.transactionAt);
    assert.equal(typeof transactions[0]?.amount, 'number');
  }
});

test('현대카드 XLSX의 숫자형 승인일과 별도 승인시각을 거래일시로 변환한다', async () => {
  const file = await exampleFile('현대카드.xlsx');
  file.originalname = '카드내역.xlsx';
  const transactions = await parseCardFile(file);
  assert.equal(transactions.length, 145);
  assert.equal(transactions[0]?.cardCompany, '현대카드');
  assert.equal(transactions[0]?.transactionAt, '2026-08-28T09:36:00');
  assert.equal(transactions.filter((item) => item.cancelled).length, 15);
  assert.equal(transactions.some((item) => item.parseErrors.length), false);
});

test('삼성카드는 파일명 접두사 없이 내부 헤더로 판별한다', async () => {
  const file = await exampleFile('일시불+할부_카드이용내역조회.xlsx');
  file.originalname = '카드내역.xlsx';
  const transactions = await parseCardFile(file);
  assert.ok(transactions.length > 0);
  assert.equal(transactions[0]?.cardCompany, '삼성카드');
});

test('카드 파일 하단의 합계와 소계 행은 거래에서 제외한다', async () => {
  const shinhan = await parseCardFile(await exampleFile('Shinhancard_20260828.xlsx'));
  const hyundai = await parseCardFile(await exampleFile('hyundaicard_20260828.xls'));
  assert.equal(shinhan.some((item) => item.sourceRow === 94), false);
  assert.equal(hyundai.some((item) => item.sourceRow >= 149), false);
  assert.equal(shinhan.some((item) => item.parseErrors.includes('거래일시를 읽을 수 없습니다.')), false);
  assert.equal(hyundai.some((item) => item.parseErrors.includes('거래일시를 읽을 수 없습니다.')), false);
});

test('카드사별 승인과 취소 상태를 원본 의미에 맞게 정규화한다', async () => {
  const samsung = await parseCardFile(await exampleFile('일시불+할부_카드이용내역조회.xlsx'));
  const shinhan = await parseCardFile(await exampleFile('Shinhancard_20260828.xlsx'));
  const hyundai = await parseCardFile(await exampleFile('hyundaicard_20260828.xls'));

  assert.ok(samsung.some((item) => item.status === '정상' && !item.cancelled));
  assert.ok(samsung.some((item) => item.status === '전체취소' && item.cancelled));
  assert.equal(samsung.some((item) => item.status === '-' || item.status === '상태 미상'), false);

  assert.ok(shinhan.some((item) => item.status === '승인' && !item.cancelled));
  assert.ok(shinhan.some((item) => item.status === '결제확정' && !item.cancelled));
  assert.equal(shinhan.some((item) => item.status === '상태 미상'), false);

  assert.ok(hyundai.some((item) => item.status === '전표접수' && !item.cancelled));
  assert.ok(hyundai.some((item) => /취소/.test(item.status) && item.cancelled));
});

test('취소 거래를 원승인과 안전하게 연결하고 미확인 거래를 구분한다', async () => {
  const samsung = linkCancellations(await parseCardFile(await exampleFile('일시불+할부_카드이용내역조회.xlsx')));
  const shinhan = linkCancellations(await parseCardFile(await exampleFile('Shinhancard_20260910.xlsx')));
  markDuplicates(samsung);
  markDuplicates(shinhan);

  const samsungCancellations = samsung.filter((item) => item.cancelled);
  assert.equal(samsungCancellations.length, 2);
  assert.equal(samsungCancellations.filter((item) => item.cancellationMatch === 'approvalNumber').length, 2);

  const shinhanCancellations = shinhan.filter((item) => item.cancelled);
  assert.equal(shinhanCancellations.length, 4);
  assert.equal(shinhanCancellations.filter((item) => item.cancellationMatch === 'merchantAmount').length, 2);
  assert.equal(shinhanCancellations.filter((item) => item.cancellationMatch === 'unmatched').length, 2);
  for (const cancellation of [...samsungCancellations, ...shinhanCancellations].filter((item) => item.cancellationOf)) {
    const original = [...samsung, ...shinhan].find((item) => item.id === cancellation.cancellationOf);
    assert.ok(original);
    assert.equal(original.cancelledBy, cancellation.id);
    assert.equal(original.selected, false);
    assert.equal(original.duplicate, undefined);
  }

  const linkedOriginal = shinhan.find((item) => item.cancelledBy);
  assert.ok(linkedOriginal);
  linkedOriginal.selected = true;
  const preview = validateAndPreview(shinhan);
  assert.equal(preview.summary.selectedCount, 0);
  assert.ok(preview.errors.some((issue) => issue.id === linkedOriginal.id && issue.message.includes('취소된 원승인')));
});

test('파서가 반환한 전체 거래는 미리보기 요청 스키마를 통과한다', async () => {
  const transactions = [];
  for (const [filename] of examples) transactions.push(...await parseCardFile(await exampleFile(filename)));
  assert.equal(itemsBodySchema.safeParse({ items: transactions, document: {} }).success, true);
});

test('선택 거래를 템플릿의 두 시트에 기록한다', async () => {
  const transactions = await parseCardFile(await exampleFile(examples[1][0]));
  const item = transactions.find(({ merchant }) => merchant.includes('철도승차권'));
  assert.ok(item);
  Object.assign(item, {
    selected: true,
    customer: '국세청',
    businessType: '프로젝트',
    region: '지방',
    category: '교통비',
    reason: '철도승차권결제',
    claimAmount: item.amount,
    tripPeriod: '26.08.25-26.08.28',
  });
  transactions.filter(({ id }) => id !== item.id).forEach((entry) => { entry.selected = false; });

  const preview = validateAndPreview(transactions, { applicant: '테스트' });
  assert.equal(preview.summary.selectedCount, 1);
  assert.equal(preview.mappings[0]?.resolutionRow, 17);
  assert.equal(preview.mappings[0]?.expenseRow, 8);

  const output = await createPaymentRequest(transactions, {
    applicant: '테스트', receiptDate: '2026-08-28', periodStart: '2026-08-21', periodEnd: '2026-08-28',
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(output as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const receiptDateCell = workbook.getWorksheet('지출결의서')?.getCell('Z9').value;
  assert.ok(receiptDateCell instanceof Date);
  assert.equal(receiptDateCell.toISOString().slice(0, 10), '2026-08-28');
  assert.equal(workbook.getWorksheet('지출결의서')?.getCell('B17').value, '철도승차권결제');
  assert.equal(formula(workbook.getWorksheet('지출결의서')!.getCell('C6')), '"일금 "& NUMBERSTRING(R6, 1) & "원 정"');
  assert.match(String(formulaResult(workbook.getWorksheet('지출결의서')!.getCell('C6'))), /^일금 [가-힣]+원 정$/);
  assert.equal(formula(workbook.getWorksheet('지출결의서')!.getCell('R6')), 'R32');
  assert.equal(workbook.getWorksheet('경비사용내역서')?.getCell('B8').value, '국세청');
  assert.equal(workbook.getWorksheet('경비사용내역서')?.getCell('I8').value, item.amount);
});

test('두 시트는 최신 거래부터 기록하고 내부 사용은 기타 아래 영역에 분리한다', async () => {
  const transactions = await parseCardFile(await exampleFile(examples[1][0]));
  transactions.forEach((item) => { item.selected = false; });
  const selected = transactions.filter((item) => !item.cancelled && item.parseErrors.length === 0).slice(0, 4);
  assert.equal(selected.length, 4);
  const configurations = [
    { date: '2026-08-01T10:00:00', customer: '외부 A', businessType: '프로젝트', category: '분류 A', reason: '상세 사유 A' },
    { date: '2026-08-03T10:00:00', customer: '외부 B', businessType: '유지보수', category: '분류 B', reason: '상세 사유 B' },
    { date: '2026-08-02T10:00:00', customer: '내부 C', businessType: '링스테크내부', category: '분류 C', reason: '상세 사유 C' },
    { date: '2026-08-04T10:00:00', customer: '내부 D', businessType: '링스테크내부', category: '분류 D', reason: '상세 사유 D' },
  ] as const;
  selected.forEach((item, index) => Object.assign(item, {
    selected: true,
    transactionAt: configurations[index]!.date,
    customer: configurations[index]!.customer,
    businessType: configurations[index]!.businessType,
    category: configurations[index]!.category,
    reason: configurations[index]!.reason,
    claimAmount: item.amount,
  }));

  const preview = validateAndPreview(transactions);
  assert.deepEqual(preview.mappings.map(({ id, resolutionRow, expenseRow }) => ({ id, resolutionRow, expenseRow })), [
    { id: selected[3]!.id, resolutionRow: 17, expenseRow: 19 },
    { id: selected[1]!.id, resolutionRow: 18, expenseRow: 8 },
    { id: selected[2]!.id, resolutionRow: 19, expenseRow: 20 },
    { id: selected[0]!.id, resolutionRow: 20, expenseRow: 9 },
  ]);

  const output = await createPaymentRequest(transactions, {});
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(output as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const resolution = workbook.getWorksheet('지출결의서')!;
  const expenses = workbook.getWorksheet('경비사용내역서')!;
  assert.deepEqual([17, 18, 19, 20].map((row) => resolution.getCell(`B${row}`).value), ['상세 사유 D', '상세 사유 B', '상세 사유 C', '상세 사유 A']);
  assert.deepEqual([8, 9].map((row) => expenses.getCell(`B${row}`).value), ['외부 B', '외부 A']);
  assert.deepEqual([8, 9].map((row) => expenses.getCell(`F${row}`).value), ['분류 B', '분류 A']);
  assert.deepEqual([19, 20].map((row) => expenses.getCell(`B${row}`).value), ['내부 D', '내부 C']);
});

test('15건을 초과하면 한 문서 안에 상세 행을 삽입한다', async () => {
  const transactions = await parseCardFile(await exampleFile(examples[0][0]));
  const selected = transactions.filter((item) => !item.cancelled && item.parseErrors.length === 0).slice(0, 16);
  selected.forEach((item) => Object.assign(item, {
    selected: true, customer: '테스트 고객사', category: item.category || '기타', claimAmount: item.amount,
  }));
  const preview = validateAndPreview(transactions);
  assert.equal(preview.summary.selectedCount, 16);
  assert.equal(preview.summary.insertedResolutionRows, 1);
  assert.equal(preview.summary.insertedExpenseRows, 6);
  assert.equal(preview.mappings.length, 16);
  assert.equal(preview.mappings[15]?.resolutionRow, 32);

  const output = await createPaymentRequest(transactions, {});
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(output as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const resolution = workbook.getWorksheet('지출결의서');
  assert.equal(workbook.getWorksheet('경비사용내역서')?.getCell('B8').value, '테스트 고객사');
  const oldest = [...selected].sort((left, right) => String(right.transactionAt || '').localeCompare(String(left.transactionAt || '')))[15];
  assert.equal(resolution?.getCell('B32').value, oldest?.reason);
  assert.equal(resolution?.getCell('F31').border.bottom?.style, 'hair');
  assert.equal(resolution?.getCell('F32').border.bottom?.style, 'hair');
  assert.equal(resolution?.getCell('R32').border.bottom?.style, 'hair');
  assert.equal(formulaResult(resolution!.getCell('F33')), preview.summary.actualTotal);
  assert.equal(formula(resolution!.getCell('R6')), 'R33');
  assert.equal(resolution?.pageSetup.printArea, 'A1:AC37');
});

test('경비사용내역서의 기타 상세 영역은 8행부터 연속으로 확장한다', async () => {
  const transactions = await parseCardFile(await exampleFile(examples[0][0]));
  const selected = transactions.filter((item) => !item.cancelled && item.parseErrors.length === 0).slice(0, 24);
  selected.forEach((item) => Object.assign(item, {
    selected: true, customer: '확장 테스트', category: item.category || '기타', claimAmount: item.amount,
  }));
  const preview = validateAndPreview(transactions);
  assert.equal(preview.summary.insertedResolutionRows, 9);
  assert.equal(preview.summary.insertedExpenseRows, 14);
  assert.equal(preview.mappings[22]?.expenseRow, 30);
  assert.equal(preview.mappings[23]?.expenseRow, 31);

  const output = await createPaymentRequest(transactions, {});
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(output as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const expenses = workbook.getWorksheet('경비사용내역서');
  assert.ok(expenses);
  assert.equal(expenses.getCell('B30').value, '확장 테스트');
  assert.equal(expenses.getCell('B31').value, '확장 테스트');
  assert.equal(expenses.getRow(31).hidden, false);
  assert.ok(expenses.model.merges.includes('B32:E32'));
  assert.equal(expenses.getRow(36).hidden, false);
  assert.equal(expenses.getRow(37).hidden, true);
  assert.equal(expenses.getRow(50).hidden, false);
  assert.equal(formulaResult(expenses.getCell('H50')), preview.summary.actualTotal);
  assert.equal(expenses.pageSetup.printArea, 'B2:J52');
});

test('링스테크 내부 상세 영역은 기타 소계 아래에서 독립적으로 확장한다', async () => {
  const transactions = await parseCardFile(await exampleFile(examples[0][0]));
  const selected = transactions.filter((item) => !item.cancelled && item.parseErrors.length === 0).slice(0, 16);
  transactions.forEach((item) => { item.selected = false; });
  selected.forEach((item, index) => Object.assign(item, {
    selected: true,
    customer: index < 12 ? `외부 ${index}` : `내부 ${index}`,
    businessType: index < 12 ? '프로젝트' : '링스테크내부',
    category: item.category || '기타',
    claimAmount: item.amount,
  }));
  const preview = validateAndPreview(transactions);
  assert.equal(preview.summary.insertedExpenseRows, 3);
  const expenseRowsById = new Map(preview.mappings.map((mapping) => [mapping.id, mapping.expenseRow]));
  assert.deepEqual(selected.slice(0, 12).map((item) => expenseRowsById.get(item.id)).sort((a, b) => a! - b!), Array.from({ length: 12 }, (_, index) => 8 + index));
  assert.deepEqual(selected.slice(12).map((item) => expenseRowsById.get(item.id)).sort((a, b) => a! - b!), [21, 22, 23, 24]);

  const output = await createPaymentRequest(transactions, {});
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(output as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const expenses = workbook.getWorksheet('경비사용내역서')!;
  assert.equal(expenses.getCell('B20').value, '기타');
  assert.equal(expenses.getCell('B25').value, '링스테크 내부');
  assert.equal(expenses.getRow(24).hidden, false);
  assert.equal(expenses.getRow(26).hidden, true);
  assert.equal(expenses.getRow(39).hidden, false);
  assert.equal(formulaResult(expenses.getCell('H39')), preview.summary.actualTotal);
  assert.equal(expenses.pageSetup.printArea, 'B2:J41');
});
