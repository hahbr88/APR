import ExcelJS from 'exceljs';
import * as cheerio from 'cheerio';
import { randomUUID } from 'node:crypto';
import { recommendCategory, transactionFingerprint } from './classifier.js';
import type { Transaction, UploadedCardFile } from './types.js';

const HEADER_ALIASES = {
  transactionAt: ['거래일', '승인일자', '승인일'],
  transactionTime: ['승인시각'],
  cardNumber: ['이용카드', '카드번호', '카드종류'],
  merchant: ['가맹점명'],
  amount: ['금액', '승인금액(원)', '승인금액'],
  approvalNumber: ['승인번호'],
  status: ['매입구분', '승인구분'],
  cancellationStatus: ['취소상태', '취소여부'],
  cancellationDate: ['취소일'],
  installment: ['이용구분', '일시불할부구분'],
} as const;

type HeaderField = keyof typeof HEADER_ALIASES;
type RawTransaction = Partial<Record<HeaderField, unknown>>;

function clean(value: unknown): string | Date {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'object' && 'text' in value && value.text !== undefined) return String(value.text).trim();
  if (typeof value === 'object' && 'result' in value && value.result !== undefined) return value.result instanceof Date ? value.result : String(value.result).trim();
  return String(value).trim();
}

function text(value: unknown): string {
  const normalized = clean(value);
  return normalized instanceof Date ? normalized.toISOString() : normalized;
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDateTime(dateValue: unknown, timeValue: unknown = ''): string | null {
  if (dateValue instanceof Date && !Number.isNaN(dateValue.valueOf())) {
    return dateValue.toISOString().slice(0, 19);
  }
  const source = `${text(dateValue)} ${text(timeValue)}`.trim();
  const parts = source.match(/(20\d{2})\D+(\d{1,2})\D+(\d{1,2})(?:\D+(\d{1,2})[:시](\d{1,2}))?/);
  if (!parts) return null;
  const [, year, month, day, hour = '00', minute = '00'] = parts;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00`;
}

function findHeaderMap(values: unknown[]): Partial<Record<HeaderField, number>> {
  const map: Partial<Record<HeaderField, number>> = {};
  values.forEach((value, index) => {
    const header = text(value);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<[HeaderField, readonly string[]]>) {
      if (aliases.includes(header) && map[field] === undefined) map[field] = index;
    }
  });
  return map;
}

function detectCompany(headers: string[], filename: string): string {
  if (headers.includes('거래일') || /shinhan/i.test(filename)) return '신한카드';
  if (headers.includes('승인일자') || /samsung|일시불\+할부_카드이용내역조회/i.test(filename)) return '삼성카드';
  if (/hyundai/i.test(filename)) return '현대카드';
  return '알 수 없음';
}

function cancelled(status: unknown, cancellationStatus: unknown, cancellationDate: unknown): boolean {
  const hasCancellationStatus = [status, cancellationStatus].some((value) => {
    const normalized = text(value);
    return /취소/.test(normalized) && !/취소.?아님/.test(normalized);
  });
  if (hasCancellationStatus) return true;
  const date = text(cancellationDate);
  return date !== '' && date !== '-';
}

function normalizedStatus(status: unknown, cancellationStatus: unknown, isCancelled: boolean): string {
  const approvalValue = text(status);
  const cancellationValue = text(cancellationStatus);
  if (isCancelled) {
    if (/취소/.test(cancellationValue) && !/취소.?아님/.test(cancellationValue)) return cancellationValue;
    if (/취소/.test(approvalValue) && !/취소.?아님/.test(approvalValue)) return approvalValue;
    return '취소';
  }
  if (approvalValue && approvalValue !== '-') return approvalValue;
  if (cancellationValue === '-' || /취소.?아님/.test(cancellationValue)) return '정상';
  return '상태 미상';
}

function isSummaryRow(raw: RawTransaction): boolean {
  const transactionDate = text(raw.transactionAt);
  const merchant = text(raw.merchant);
  const hasNoTransactionDate = transactionDate === '' || transactionDate === '-';
  return hasNoTransactionDate && (/(?:소계|합계)/.test(merchant) || /^총\s*\d+\s*건/.test(merchant));
}

interface ParseContext {
  filename: string;
  sourceRow: number;
  cardCompany: string;
  remembered: Record<string, string>;
}

function createTransaction(raw: RawTransaction, context: ParseContext): Transaction {
  const errors: string[] = [];
  const transactionAt = isoDateTime(raw.transactionAt, raw.transactionTime);
  const amount = numberValue(raw.amount);
  const merchant = text(raw.merchant);
  if (!transactionAt) errors.push('거래일시를 읽을 수 없습니다.');
  if (amount === null) errors.push('금액을 읽을 수 없습니다.');
  if (!merchant) errors.push('가맹점명이 없습니다.');

  const recommendation = recommendCategory(merchant, context.remembered);
  const isCancelled = cancelled(raw.status, raw.cancellationStatus, raw.cancellationDate);
  const transaction: Transaction = {
    id: randomUUID(),
    sourceFile: context.filename,
    sourceRow: context.sourceRow,
    cardCompany: context.cardCompany,
    cardNumber: text(raw.cardNumber),
    transactionAt,
    merchant,
    amount,
    approvalNumber: text(raw.approvalNumber),
    status: normalizedStatus(raw.status, raw.cancellationStatus, isCancelled),
    cancellationDate: text(raw.cancellationDate),
    installment: text(raw.installment),
    cancelled: isCancelled,
    parseErrors: errors,
    category: recommendation.category,
    categorySource: recommendation.source,
    selected: false,
    customer: '',
    businessType: '프로젝트',
    region: '서울',
    reason: merchant,
    actualAmount: amount,
    claimAmount: amount,
    tripPeriod: '',
    fingerprint: '',
  };
  transaction.fingerprint = transactionFingerprint(transaction);
  return transaction;
}

function rowValues(row: ExcelJS.Row): unknown[] {
  return Array.isArray(row.values) ? row.values.slice(1) : [];
}

async function parseXlsx(buffer: Buffer, filename: string, remembered: Record<string, string>): Promise<Transaction[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  let selected: ExcelJS.Worksheet | undefined;
  let headerRowNumber = 0;
  let headerValues: string[] = [];

  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow((row, rowNumber) => {
      if (selected) return;
      const values = rowValues(row).map(text);
      if (values.includes('가맹점명') && values.some((value) => ['거래일', '승인일자', '승인일'].includes(value))) {
        selected = worksheet;
        headerRowNumber = rowNumber;
        headerValues = values;
      }
    });
    if (selected) break;
  }

  if (!selected) throw new Error('카드 이용내역의 헤더 행을 찾지 못했습니다.');
  const worksheet: ExcelJS.Worksheet = selected;
  const headerMap = findHeaderMap(headerValues);
  const cardCompany = detectCompany(headerValues, filename);
  const transactions: Transaction[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    const values = rowValues(row);
    if (values.every((value) => text(value) === '')) return;
    const raw: RawTransaction = {};
    for (const [field, index] of Object.entries(headerMap) as Array<[HeaderField, number]>) raw[field] = values[index];
    if (isSummaryRow(raw)) return;
    transactions.push(createTransaction(raw, { filename, sourceRow: rowNumber, cardCompany, remembered }));
  });
  return transactions;
}

function parseHtml(buffer: Buffer, filename: string, remembered: Record<string, string>): Transaction[] {
  const $ = cheerio.load(buffer.toString('utf8'));
  const rows = $('tr').toArray().map((row) => $(row).find('th,td').toArray().map((cell) => $(cell).text().replace(/\s+/g, ' ').trim()));
  const headerIndex = rows.findIndex((values) => values.includes('가맹점명') && values.includes('승인일'));
  if (headerIndex < 0) throw new Error('HTML 카드 이용내역의 헤더 행을 찾지 못했습니다.');
  const headers = rows[headerIndex];
  const headerMap = findHeaderMap(headers);
  return rows.slice(headerIndex + 1)
    .filter((values) => values.some(Boolean))
    .flatMap((values, index) => {
      const raw: RawTransaction = {};
      for (const [field, column] of Object.entries(headerMap) as Array<[HeaderField, number]>) raw[field] = values[column];
      if (isSummaryRow(raw)) return [];
      return [createTransaction(raw, {
        filename,
        sourceRow: headerIndex + index + 2,
        cardCompany: '현대카드',
        remembered,
      })];
    });
}

export async function parseCardFile(file: UploadedCardFile, remembered: Record<string, string> = {}): Promise<Transaction[]> {
  const prefix = file.buffer.subarray(0, 4).toString('binary');
  const looksLikeZip = prefix.startsWith('PK');
  const looksLikeHtml = /<html|<!doctype|<table/i.test(file.buffer.toString('utf8'));
  if (looksLikeZip) return parseXlsx(file.buffer, file.originalname, remembered);
  if (looksLikeHtml) return parseHtml(file.buffer, file.originalname, remembered);
  throw new Error('지원하지 않는 파일 형식입니다. XLSX 또는 카드사 HTML XLS 파일을 사용해 주세요.');
}

export function markDuplicates(transactions: Transaction[]): Transaction[] {
  const fingerprints = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const seen = fingerprints.get(transaction.fingerprint) || [];
    seen.push(transaction);
    fingerprints.set(transaction.fingerprint, seen);
  }
  for (const matches of fingerprints.values()) {
    if (matches.length < 2) continue;
    matches.forEach((transaction, index) => {
      transaction.duplicate = true;
      transaction.duplicateOf = matches[index === 0 ? 1 : 0]?.id;
      if (index > 0) transaction.selected = false;
    });
  }
  return transactions;
}
