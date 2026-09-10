import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import type { DocumentInfo, PreviewIssue, PreviewResult, Transaction } from './types.js';

const BASE_RESOLUTION_CAPACITY = 15;
const EXTERNAL_EXPENSE_START_ROW = 8;
const EXTERNAL_EXPENSE_CAPACITY = 10;
const INTERNAL_EXPENSE_START_ROW = 19;
const INTERNAL_EXPENSE_CAPACITY = 3;

type NormalizedTransaction = Omit<Transaction, 'actualAmount' | 'claimAmount'> & {
  actualAmount: number;
  claimAmount: number;
};

function amount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateOnly(value: string | null): string {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]?.slice(2)}.${match[2]}.${match[3]}` : '';
}

function koreanDate(value?: string): Date {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3])) return date;
  }
  const today = new Date();
  return new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
}

function displayDate(value?: string): string {
  const date = koreanDate(value);
  return `${date.getUTCFullYear()}. ${String(date.getUTCMonth() + 1).padStart(2, '0')}. ${String(date.getUTCDate()).padStart(2, '0')}`;
}

function koreanNumber(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) return value.toLocaleString('ko-KR');
  if (value === 0) return '영';
  const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const smallUnits = ['', '십', '백', '천'];
  const largeUnits = ['', '만', '억', '조'];
  let remaining = value;
  let result = '';
  let largeUnitIndex = 0;
  while (remaining > 0) {
    const group = remaining % 10_000;
    if (group > 0) {
      let groupText = '';
      for (let unitIndex = 3; unitIndex >= 0; unitIndex -= 1) {
        const digit = Math.floor(group / (10 ** unitIndex)) % 10;
        if (digit === 0) continue;
        if (digit !== 1 || unitIndex === 0) groupText += digits[digit];
        groupText += smallUnits[unitIndex];
      }
      result = `${groupText}${largeUnits[largeUnitIndex]}${result}`;
    }
    remaining = Math.floor(remaining / 10_000);
    largeUnitIndex += 1;
  }
  return result;
}

function safeItem(item: Transaction): NormalizedTransaction {
  return {
    ...item,
    actualAmount: amount(item.actualAmount ?? item.amount),
    claimAmount: amount(item.claimAmount ?? item.amount),
    category: String(item.category || '기타').trim(),
    reason: String(item.reason || item.merchant || '').trim(),
  };
}

function recentFirst(items: NormalizedTransaction[]): NormalizedTransaction[] {
  return [...items].sort((left, right) => String(right.transactionAt || '').localeCompare(String(left.transactionAt || '')));
}

function selectedTransactions(items: Transaction[]): NormalizedTransaction[] {
  return recentFirst(items.map(safeItem).filter((item) => item.selected && !item.cancelled && !item.cancelledBy && item.parseErrors.length === 0));
}

interface ExpenseLayout {
  rowsById: Map<string, number>;
  externalExtraRows: number;
  internalExtraRows: number;
  insertedRows: number;
  detailRows: number[];
}

function createExpenseLayout(selected: NormalizedTransaction[]): ExpenseLayout {
  const external = selected.filter((item) => item.businessType !== '링스테크내부');
  const internal = selected.filter((item) => item.businessType === '링스테크내부');
  const externalExtraRows = Math.max(0, external.length - EXTERNAL_EXPENSE_CAPACITY);
  const internalExtraRows = Math.max(0, internal.length - INTERNAL_EXPENSE_CAPACITY);
  const internalStartRow = INTERNAL_EXPENSE_START_ROW + externalExtraRows;
  const rowsById = new Map<string, number>();
  external.forEach((item, index) => rowsById.set(item.id, EXTERNAL_EXPENSE_START_ROW + index));
  internal.forEach((item, index) => rowsById.set(item.id, internalStartRow + index));
  return {
    rowsById,
    externalExtraRows,
    internalExtraRows,
    insertedRows: externalExtraRows + internalExtraRows,
    detailRows: [...rowsById.values()],
  };
}

export function validateAndPreview(items: Transaction[], document: DocumentInfo = {}): PreviewResult {
  const normalized = items.map(safeItem);
  const selectable = recentFirst(normalized.filter((item) => item.selected && !item.cancelled && !item.cancelledBy && item.parseErrors.length === 0));
  const expenseLayout = createExpenseLayout(selectable);
  const errors: PreviewIssue[] = [];
  const warnings: PreviewIssue[] = [];

  for (const item of normalized.filter((entry) => entry.selected)) {
    if (item.cancelled) errors.push({ id: item.id, message: '취소 거래는 내보낼 수 없습니다.' });
    if (item.cancelledBy) errors.push({ id: item.id, message: '취소된 원승인 거래는 내보낼 수 없습니다.' });
    for (const message of item.parseErrors) errors.push({ id: item.id, message });
    if (!item.customer) warnings.push({ id: item.id, message: '고객사명이 비어 있습니다.' });
    if (!item.category) warnings.push({ id: item.id, message: '실사용 내역 구분이 비어 있습니다.' });
    if (item.region === '지방' && !item.tripPeriod) warnings.push({ id: item.id, message: '지방 출장 기간이 비어 있습니다.' });
    if (item.claimAmount > item.actualAmount) warnings.push({ id: item.id, message: '청구금액이 실사용금액보다 큽니다.' });
    if (item.duplicate) warnings.push({ id: item.id, message: '중복으로 의심되는 거래입니다.' });
    if (item.status === '상태 미상') warnings.push({ id: item.id, message: '승인·취소 상태를 확인할 수 없습니다.' });
  }

  const mappings = selectable.map((item, index) => ({
    id: item.id,
    merchant: item.merchant,
    category: item.category,
    reason: item.reason,
    resolutionRow: 17 + index,
    expenseRow: expenseLayout.rowsById.get(item.id)!,
  }));

  const allActual = normalized.reduce((sum, item) => sum + item.actualAmount, 0);
  const selectedActual = selectable.reduce((sum, item) => sum + item.actualAmount, 0);
  return {
    document,
    summary: {
      selectedCount: selectable.length,
      actualTotal: selectedActual,
      claimTotal: selectable.reduce((sum, item) => sum + item.claimAmount, 0),
      excludedAmount: Math.max(0, allActual - selectedActual),
      insertedResolutionRows: Math.max(0, selectable.length - BASE_RESOLUTION_CAPACITY),
      insertedExpenseRows: expenseLayout.insertedRows,
    },
    mappings,
    errors,
    warnings,
  };
}

function clearTemplate(
  resolution: ExcelJS.Worksheet,
  expenses: ExcelJS.Worksheet,
  resolutionDetailRows: number[],
  expenseDetailRows: number[],
): void {
  for (const row of resolutionDetailRows) {
    resolution.getCell(`B${row}`).value = null;
    resolution.getCell(`F${row}`).value = null;
    resolution.getCell(`R${row}`).value = null;
  }
  for (const row of expenseDetailRows) {
    for (const column of ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']) expenses.getCell(`${column}${row}`).value = null;
  }
}

function updateExpenseTotals(expenses: ExcelJS.Worksheet, externalExtraRows: number, internalExtraRows: number): void {
  const insertedRows = externalExtraRows + internalExtraRows;
  const groups = [
    { row: 18 + externalExtraRows, start: 8, end: 17 + externalExtraRows },
    { row: 22 + insertedRows, start: 19 + externalExtraRows, end: 21 + insertedRows },
    { row: 24 + insertedRows, start: 23 + insertedRows, end: 23 + insertedRows },
    { row: 29 + insertedRows, start: 25 + insertedRows, end: 28 + insertedRows },
    { row: 33 + insertedRows, start: 30 + insertedRows, end: 32 + insertedRows },
    { row: 35 + insertedRows, start: 34 + insertedRows, end: 34 + insertedRows },
  ];
  const totals = groups.map(({ row, start, end }) => {
    const actual = Array.from({ length: end - start + 1 }, (_, index) => amount(expenses.getCell(`H${start + index}`).value)).reduce((a, b) => a + b, 0);
    const claim = Array.from({ length: end - start + 1 }, (_, index) => amount(expenses.getCell(`I${start + index}`).value)).reduce((a, b) => a + b, 0);
    expenses.getCell(`H${row}`).value = { formula: `SUM(H${start}:H${end})`, result: actual };
    expenses.getCell(`I${row}`).value = { formula: `SUM(I${start}:I${end})`, result: claim };
    return { actual, claim };
  });
  const actualTotal = totals.reduce((sum, total) => sum + total.actual, 0);
  const claimTotal = totals.reduce((sum, total) => sum + total.claim, 0);
  const totalRow = 36 + insertedRows;
  const advanceRow = 37 + insertedRows;
  const claimRow = 38 + insertedRows;
  const subtotalRows = groups.map(({ row }) => row);
  const subtotalFormula = (column: 'H' | 'I') => `SUM(${subtotalRows.map((row) => `${column}${row}`).join(',')})`;
  expenses.getCell(`H${totalRow}`).value = { formula: subtotalFormula('H'), result: actualTotal };
  expenses.getCell(`I${totalRow}`).value = { formula: subtotalFormula('I'), result: claimTotal };
  expenses.getCell(`H${claimRow}`).value = { formula: `H${totalRow}-H${advanceRow}`, result: actualTotal - amount(expenses.getCell(`H${advanceRow}`).value) };
  expenses.getCell(`I${claimRow}`).value = { formula: `I${totalRow}-I${advanceRow}`, result: claimTotal - amount(expenses.getCell(`I${advanceRow}`).value) };
}

function shiftedMerge(range: string, insertAt: number, count: number): string {
  const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!match) return range;
  const [, startColumn, startText, endColumn, endText] = match;
  let start = Number(startText);
  let end = Number(endText);
  if (start >= insertAt) {
    start += count;
    end += count;
  } else if (end >= insertAt) {
    end += count;
  }
  return `${startColumn}${start}:${endColumn}${end}`;
}

function cloneStyle(style: Partial<ExcelJS.Style>): Partial<ExcelJS.Style> {
  return JSON.parse(JSON.stringify(style || {})) as Partial<ExcelJS.Style>;
}

function insertStyledRows(worksheet: ExcelJS.Worksheet, insertAt: number, count: number, templateRowNumber: number): void {
  if (count <= 0) return;
  const merges = [...worksheet.model.merges];
  const template = worksheet.getRow(templateRowNumber);
  const height = template.height;
  const styles = Array.from({ length: worksheet.columnCount }, (_, index) => cloneStyle(template.getCell(index + 1).style));
  merges.forEach((range) => worksheet.unMergeCells(range));
  worksheet.insertRows(insertAt, Array.from({ length: count }, () => []), 'i');
  for (let offset = 0; offset < count; offset += 1) {
    const row = worksheet.getRow(insertAt + offset);
    row.height = height;
    row.hidden = false;
    styles.forEach((style, index) => { row.getCell(index + 1).style = cloneStyle(style); });
  }
  merges.map((range) => shiftedMerge(range, insertAt, count)).forEach((range) => worksheet.mergeCells(range));
}

function copyRowStyle(worksheet: ExcelJS.Worksheet, targetRowNumber: number, sourceRowNumber: number): void {
  const source = worksheet.getRow(sourceRowNumber);
  const target = worksheet.getRow(targetRowNumber);
  target.height = source.height;
  target.hidden = false;
  for (let column = 1; column <= worksheet.columnCount; column += 1) {
    target.getCell(column).style = cloneStyle(source.getCell(column).style);
  }
}

function updateExpenseRowVisibility(expenses: ExcelJS.Worksheet, insertedRows: number): void {
  for (let row = 8; row <= 22 + insertedRows; row += 1) expenses.getRow(row).hidden = false;
  for (let row = 23 + insertedRows; row <= 35 + insertedRows; row += 1) expenses.getRow(row).hidden = true;
  for (let row = 36 + insertedRows; row <= 38 + insertedRows; row += 1) expenses.getRow(row).hidden = false;
}

export async function createPaymentRequest(items: Transaction[], document: DocumentInfo = {}): Promise<Buffer> {
  const selected = selectedTransactions(items);
  if (selected.length === 0) throw new Error('내보낼 거래가 없습니다.');

  const template = await fs.readFile(path.resolve('assets/payment-request-template.xlsx'));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  workbook.creator = 'Expense Resolution';
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  (workbook.calcProperties as typeof workbook.calcProperties & { forceFullCalc?: boolean }).forceFullCalc = true;

  const resolution = workbook.getWorksheet('지출결의서');
  const expenses = workbook.getWorksheet('경비사용내역서');
  if (!resolution || !expenses) throw new Error('템플릿에서 필수 시트를 찾지 못했습니다.');
  const insertedResolutionRows = Math.max(0, selected.length - BASE_RESOLUTION_CAPACITY);
  const expenseLayout = createExpenseLayout(selected);
  const insertedExpenseRows = expenseLayout.insertedRows;
  if (insertedResolutionRows > 0) copyRowStyle(resolution, 31, 30);
  insertStyledRows(resolution, 32, insertedResolutionRows, 30);
  insertStyledRows(expenses, 18, expenseLayout.externalExtraRows, 17);
  insertStyledRows(expenses, 22 + expenseLayout.externalExtraRows, expenseLayout.internalExtraRows, 21 + expenseLayout.externalExtraRows);
  updateExpenseRowVisibility(expenses, insertedExpenseRows);
  for (let offset = 0; offset < insertedResolutionRows; offset += 1) {
    const row = 32 + offset;
    resolution.mergeCells(`B${row}:E${row}`);
    resolution.mergeCells(`F${row}:Q${row}`);
    resolution.mergeCells(`R${row}:AC${row}`);
  }
  const resolutionDetailRows = Array.from({ length: selected.length }, (_, index) => 17 + index);
  const expenseDetailRows = expenseLayout.detailRows;
  clearTemplate(resolution, expenses, resolutionDetailRows, expenseDetailRows);
  resolution.pageSetup.printArea = `A1:AC${36 + insertedResolutionRows}`;
  expenses.pageSetup.printArea = `B2:J${38 + insertedExpenseRows}`;

  const actualTotal = selected.reduce((sum, item) => sum + item.actualAmount, 0);
  const claimTotal = selected.reduce((sum, item) => sum + item.claimAmount, 0);
  const resolutionTotalRow = 32 + insertedResolutionRows;
  const receiptDate = document.receiptDate || new Date().toISOString().slice(0, 10);
  const dates = selected.map((item) => item.transactionAt?.slice(0, 10)).filter((value): value is string => Boolean(value)).sort();
  const periodStart = document.periodStart || dates[0] || receiptDate;
  const periodEnd = document.periodEnd || dates.at(-1) || receiptDate;

  resolution.getCell('C6').value = { formula: '"일금 "& NUMBERSTRING(R6, 1) & "원 정"', result: `일금 ${koreanNumber(claimTotal)}원 정` };
  resolution.getCell('R6').value = { formula: `R${resolutionTotalRow}`, result: claimTotal };
  resolution.getCell('C9').value = `기간 : ${periodStart.replaceAll('-', '.')} ~ ${periodEnd.replaceAll('-', '.')}`;
  resolution.getCell('C10').value = `접수자 : ${document.applicant || ''}`;
  resolution.getCell('C11').value = `접수일 : ${receiptDate.replaceAll('-', '.')}`;
  resolution.getCell('Z9').value = koreanDate(receiptDate);

  expenses.getCell('C4').value = document.applicant || '';
  expenses.getCell('F4').value = `${periodStart.replaceAll('-', '.')} ~ ${periodEnd.replaceAll('-', '.')}`;
  expenses.getCell('C5').value = displayDate(receiptDate);

  selected.forEach((item, index) => {
    const resolutionRow = resolutionDetailRows[index]!;
    resolution.getCell(`B${resolutionRow}`).value = item.reason;
    resolution.getCell(`F${resolutionRow}`).value = item.actualAmount;
    resolution.getCell(`R${resolutionRow}`).value = item.claimAmount;

    const expenseRow = expenseLayout.rowsById.get(item.id)!;
    expenses.getCell(`B${expenseRow}`).value = item.customer;
    expenses.getCell(`C${expenseRow}`).value = item.businessType;
    expenses.getCell(`D${expenseRow}`).value = item.region;
    expenses.getCell(`E${expenseRow}`).value = dateOnly(item.transactionAt);
    expenses.getCell(`F${expenseRow}`).value = item.category;
    expenses.getCell(`G${expenseRow}`).value = item.reason;
    expenses.getCell(`H${expenseRow}`).value = item.actualAmount;
    expenses.getCell(`I${expenseRow}`).value = item.claimAmount;
    expenses.getCell(`J${expenseRow}`).value = item.tripPeriod;
  });

  resolution.getCell(`F${resolutionTotalRow}`).value = { formula: `SUM(F17:F${resolutionTotalRow - 1})`, result: actualTotal };
  resolution.getCell(`R${resolutionTotalRow}`).value = { formula: `SUM(R17:R${resolutionTotalRow - 1})`, result: claimTotal };
  updateExpenseTotals(expenses, expenseLayout.externalExtraRows, expenseLayout.internalExtraRows);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
